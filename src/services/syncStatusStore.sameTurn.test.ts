import { emitRecordingDataChanged } from './recordingDataEvents';
import { emitUploadSessionEvent } from './syncEvents';
import {
  getSyncStatusSnapshot,
  refreshSyncStatusStore,
  resetSyncStatusStore,
  resetSyncStatusStoreForTests,
  subscribeToSyncStatusStore,
} from './syncStatusStore';
import {
  getFailedUploadCount,
  getFailedUploadErrorSummary,
  getPendingUploadChapters,
  getPendingUploadCount,
  getUnuploadablePendingSummary,
} from '../db/queries';

let mockPending = 2;

jest.mock('../utils/parseUserId', () => ({ parseUserId: jest.fn(() => 7) }));
jest.mock('../db/queries', () => ({
  getDatabaseWriteMark: jest.fn(() => Promise.resolve(null)),
  sameDatabaseWrites: jest.fn(() => false),
  getPendingUploadCount: jest.fn(async () => mockPending),
  getPendingUploadChapters: jest.fn(async () =>
    mockPending ? [{ bookId: 1, chapterNumber: 1 }] : [],
  ),
  getFailedUploadCount: jest.fn(async () => 0),
  getFailedUploadErrorSummary: jest.fn(async () => null),
  getUnuploadablePendingSummary: jest.fn(async () => ({ total: 0 })),
}));
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const reads = [
  getPendingUploadCount,
  getPendingUploadChapters,
  getFailedUploadCount,
  getFailedUploadErrorSummary,
  getUnuploadablePendingSummary,
] as jest.Mock[];

function settle() {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

/** The next pending-count read waits until `resolve` is called. */
function holdNextPendingRead() {
  let resolve!: (count: number) => void;
  (getPendingUploadCount as jest.Mock).mockImplementationOnce(
    () =>
      new Promise<number>(res => {
        resolve = res;
      }),
  );
  return (count: number) => resolve(count);
}

function readCounts() {
  return reads.map(read => read.mock.calls.length);
}

describe('refreshSyncStatusStore in one turn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSyncStatusStoreForTests();
    mockPending = 2;
  });

  it('shares one read between callers in the same turn', async () => {
    await Promise.all([
      refreshSyncStatusStore(),
      refreshSyncStatusStore(),
      refreshSyncStatusStore(),
    ]);

    expect(readCounts()).toEqual([1, 1, 1, 1, 1]);
    expect(getSyncStatusSnapshot().pendingCount).toBe(2);
  });

  it('reads again in a later turn and shows what was written since', async () => {
    await refreshSyncStatusStore();
    mockPending = 3;

    await refreshSyncStatusStore();

    expect(readCounts()).toEqual([2, 2, 2, 2, 2]);
    expect(getSyncStatusSnapshot().pendingCount).toBe(3);
  });

  it('reads again after a reset in the same turn', async () => {
    const before = refreshSyncStatusStore();
    resetSyncStatusStore();
    mockPending = 5;
    const after = refreshSyncStatusStore();
    await Promise.all([before, after]);

    expect(readCounts()).toEqual([2, 2, 2, 2, 2]);
    expect(getSyncStatusSnapshot().pendingCount).toBe(5);
  });

  it('ends the upload when its complete event joins a refresh already started', async () => {
    const unsubscribe = subscribeToSyncStatusStore(() => {});
    emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
    await settle();
    expect(getSyncStatusSnapshot().isUploading).toBe(true);
    const before = readCounts();

    const started = refreshSyncStatusStore();
    emitUploadSessionEvent({ type: 'complete' });
    await started;

    expect(readCounts()).toEqual(before.map(n => n + 1));
    expect(getSyncStatusSnapshot().isUploading).toBe(false);
    unsubscribe();
  });

  it('retries a failed read on the next call', async () => {
    (getPendingUploadCount as jest.Mock).mockRejectedValueOnce(
      new Error('disk I/O error'),
    );
    await refreshSyncStatusStore();
    expect(getSyncStatusSnapshot().countsUnknown).toBe(true);

    await refreshSyncStatusStore();

    expect(getSyncStatusSnapshot().countsUnknown).toBe(false);
    expect(readCounts()[0]).toBe(2);
  });

  describe('while an older read is still out', () => {
    it('keeps the newer counts and the finished upload when the older read lands last', async () => {
      const unsubscribe = subscribeToSyncStatusStore(() => {});
      emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
      await settle();
      expect(getSyncStatusSnapshot().isUploading).toBe(true);

      const finishOlder = holdNextPendingRead();
      const older = refreshSyncStatusStore();
      await settle();

      // A take is saved, then the upload ends: both re-read in a new turn.
      mockPending = 3;
      emitRecordingDataChanged();
      emitUploadSessionEvent({ type: 'complete' });
      await settle();
      expect(getSyncStatusSnapshot()).toMatchObject({
        pendingCount: 3,
        isUploading: false,
        uploadProgress: null,
      });

      finishOlder(1);
      await older;
      await settle();

      expect(getSyncStatusSnapshot()).toMatchObject({
        pendingCount: 3,
        isUploading: false,
        uploadProgress: null,
      });
      expect((getPendingUploadCount as jest.Mock).mock.calls.length).toBe(3);
      unsubscribe();
    });

    it("never publishes the previous account's counts after a reset", async () => {
      const finishOlder = holdNextPendingRead();
      const older = refreshSyncStatusStore();
      await settle();

      resetSyncStatusStore();
      expect(getSyncStatusSnapshot().pendingCount).toBe(0);
      mockPending = 4;
      await refreshSyncStatusStore();
      expect(getSyncStatusSnapshot().pendingCount).toBe(4);

      finishOlder(9);
      await older;
      await settle();

      expect(getSyncStatusSnapshot().pendingCount).toBe(4);
    });

    it('reads fresh after a reset in the same turn as the older read', async () => {
      const finishOlder = holdNextPendingRead();
      const older = refreshSyncStatusStore();
      resetSyncStatusStore();
      mockPending = 4;
      const fresh = refreshSyncStatusStore();

      expect(fresh).not.toBe(older);
      await fresh;
      expect(getSyncStatusSnapshot().pendingCount).toBe(4);

      finishOlder(9);
      await older;
      await settle();

      expect(getSyncStatusSnapshot().pendingCount).toBe(4);
      expect((getPendingUploadCount as jest.Mock).mock.calls.length).toBe(2);
    });
  });
});
