import * as FileSystem from 'expo-file-system/legacy';
import { waitFor } from '@testing-library/react-native';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import type { PendingRecording } from '../types/db/types';
import { ApiError } from '../types/api/errors';
import type { VerseAudioResponse } from '../types/api/verseAudio';
import { AuthError } from './authError';
import { authToken } from './authToken';
import {
  __resetRecordingSyncForTests,
  ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
  createChapterUploadWorker,
  drainPendingRecordingDeletions,
  MAX_UPLOAD_ATTEMPTS,
  registerRecordingUploadWorker,
  syncPendingRecordings,
  uploadChapterRecordings,
} from './recordingSync';
import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  sessionRetryDelayMs,
  type ChapterUploadWorker,
} from './uploadOrchestratorCore';
import type { UploadSessionEvent } from './syncEvents';

const mockGetPendingRecordings = jest.fn();
const mockGetLatestVersionToken = jest.fn();
const mockSetRecordingSyncStatus = jest.fn();
const mockMarkRecordingUploaded = jest.fn();
const mockMarkRecordingConflicted = jest.fn();
const mockMarkRecordingAndChapterConflicted = jest.fn();
const mockMarkChapterHasConflictForVerse = jest.fn();
const mockMarkRecordingFailed = jest.fn();
const mockUpdateRecordingVersionToken = jest.fn();
const mockUploadVerseAudio = jest.fn();
const mockSetChapterUploadWorker = jest.fn();
const mockGetCredentials = jest.fn();
const mockGetActiveUserId = jest.fn();
const mockSetReauthRequired = jest.fn();
const mockEmitAuthReauthRequired = jest.fn();
const mockEmitUploadSessionEvent = jest.fn();
const mockGetPendingRecordingDeletions = jest.fn();
const mockClearRecordingDeletion = jest.fn();
const mockRaiseVerseVersionToken = jest.fn();
const mockDeleteVerseAudioTake = jest.fn();
const mockReconcileHeldRecordings = jest.fn();

jest.mock('../db/repositories/heldRecordingsRepository', () => ({
  reconcileHeldRecordings: (...args: unknown[]) =>
    mockReconcileHeldRecordings(...args),
}));

jest.mock('../db/repository', () => ({
  getPendingRecordings: (...args: unknown[]) =>
    mockGetPendingRecordings(...args),
  getLatestVersionToken: (...args: unknown[]) =>
    mockGetLatestVersionToken(...args),
  setRecordingSyncStatus: (...args: unknown[]) =>
    mockSetRecordingSyncStatus(...args),
  markRecordingUploaded: (...args: unknown[]) =>
    mockMarkRecordingUploaded(...args),
  markRecordingConflicted: (...args: unknown[]) =>
    mockMarkRecordingConflicted(...args),
  markRecordingAndChapterConflicted: (...args: unknown[]) =>
    mockMarkRecordingAndChapterConflicted(...args),
  markChapterHasConflictForVerse: (...args: unknown[]) =>
    mockMarkChapterHasConflictForVerse(...args),
  markRecordingFailed: (...args: unknown[]) => mockMarkRecordingFailed(...args),
  updateRecordingVersionToken: (...args: unknown[]) =>
    mockUpdateRecordingVersionToken(...args),
  getPendingRecordingDeletions: (...args: unknown[]) =>
    mockGetPendingRecordingDeletions(...args),
  clearRecordingDeletion: (...args: unknown[]) =>
    mockClearRecordingDeletion(...args),
  raiseVerseVersionToken: (...args: unknown[]) =>
    mockRaiseVerseVersionToken(...args),
}));

const mockGetVerseAudioUnit = jest.fn();
const mockSha256File = jest.fn();
jest.mock('./fileSha256', () => ({
  ...jest.requireActual('./fileSha256'),
  sha256File: (...args: unknown[]) => mockSha256File(...args),
}));

jest.mock('./api', () => ({
  FluentAPI: {
    uploadVerseAudio: (...args: unknown[]) => mockUploadVerseAudio(...args),
    getVerseAudioUnit: (...args: unknown[]) => mockGetVerseAudioUnit(...args),
    deleteVerseAudioTake: (...args: unknown[]) =>
      mockDeleteVerseAudioTake(...args),
  },
}));

jest.mock('./uploadOrchestrator', () => ({
  setChapterUploadWorker: (...args: unknown[]) =>
    mockSetChapterUploadWorker(...args),
}));

let mockCredentialsVersion = 0;
jest.mock('./keychain', () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
  getCredentialsVersion: () => mockCredentialsVersion,
}));

// In-memory KV so the real upload operation state runs in tests.
const mockKv = new Map<string, string>();

jest.mock('./storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  setReauthRequired: (...args: unknown[]) => mockSetReauthRequired(...args),
  kvStorage: {
    getItemSync: (key: string) => mockKv.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockKv.set(key, value);
    },
    removeItemSync: (key: string) => {
      mockKv.delete(key);
    },
  },
}));

// In-memory durable receipts (#886); `mockReceiptWriteFails` simulates a
// KV write failure so the "no receipt" branch can be exercised.
const mockReceipts = new Map<string, Record<string, unknown>>();
let mockReceiptWriteFails = false;
jest.mock('./uploadReceipts', () => ({
  persistUploadReceipt: (receipt: { recordingId: string }) => {
    if (mockReceiptWriteFails) return false;
    mockReceipts.set(receipt.recordingId, { ...receipt });
    return true;
  },
  readUploadReceipt: (recordingId: string) =>
    mockReceipts.get(recordingId) ?? null,
  clearUploadReceipt: (recordingId: string) => {
    mockReceipts.delete(recordingId);
  },
  retainUploadReceiptUnbound: (recordingId: string) => {
    const receipt = mockReceipts.get(recordingId);
    if (!receipt) return;
    mockReceipts.delete(recordingId);
    mockReceipts.set(`unbound:${recordingId}`, receipt);
  },
}));

jest.mock('./syncEvents', () => ({
  emitUploadSessionEvent: (...args: unknown[]) =>
    mockEmitUploadSessionEvent(...args),
  emitAuthReauthRequired: (...args: unknown[]) =>
    mockEmitAuthReauthRequired(...args),
}));

const FILE_URI = 'file:///mock-document/recordings/verse-1.m4a';

function pendingRecording(
  overrides: Partial<PendingRecording> = {},
): PendingRecording {
  return {
    id: 'rec-1',
    bibleTextId: 42,
    localFilePath: FILE_URI,
    durationMs: 1500,
    bookId: 40,
    chapterNumber: 1,
    projectUnitId: 12,
    recordedByUserId: null,
    granularity: 'verse',
    startChapter: null,
    startVerse: null,
    endChapter: null,
    endVerse: null,
    isCanonical: false,
    isSelected: true,
    ...overrides,
  };
}

function successResponse(
  overrides: Partial<VerseAudioResponse> = {},
): VerseAudioResponse {
  return {
    id: 9,
    projectUnitId: 12,
    bibleTextId: 42,
    uploadedBy: 1,
    contentType: 'audio/mp4',
    sizeBytes: 100,
    durationSeconds: 1.5,
    versionToken: 2,
    conflictStatus: 'clean',
    activeTakeId: 9,
    takeId: 9,
    takes: [],
    verseNumber: 1,
    downloadUrl: 'https://example.test/a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('recordingSync', () => {
  const delay = jest.fn(async () => undefined);

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetRecordingSyncForTests();
    resetFileSystemMock();
    mockKv.clear();
    mockReceipts.clear();
    mockReceiptWriteFails = false;
    authToken.set(null);
    await FileSystem.writeAsStringAsync(FILE_URI, 'fake-audio');
    mockGetPendingRecordings.mockResolvedValue([pendingRecording()]);
    mockGetLatestVersionToken.mockResolvedValue(undefined);
    mockSetRecordingSyncStatus.mockResolvedValue(undefined);
    mockMarkRecordingUploaded.mockResolvedValue(undefined);
    mockMarkRecordingConflicted.mockResolvedValue(undefined);
    mockMarkRecordingAndChapterConflicted.mockResolvedValue(undefined);
    mockMarkChapterHasConflictForVerse.mockResolvedValue(undefined);
    mockMarkRecordingFailed.mockResolvedValue(undefined);
    mockUploadVerseAudio.mockResolvedValue(successResponse());
    mockGetCredentials.mockResolvedValue(null);
    mockGetActiveUserId.mockReturnValue('2');
    mockGetPendingRecordingDeletions.mockResolvedValue([]);
    mockClearRecordingDeletion.mockResolvedValue(undefined);
    mockRaiseVerseVersionToken.mockResolvedValue(undefined);
    mockDeleteVerseAudioTake.mockResolvedValue({ versionToken: 3 });
    mockReconcileHeldRecordings.mockResolvedValue({ held: 0, released: 0 });
    // Reconciliation after a possibly-applied failure: nothing on the server
    // yet, so a first-take activation replays.
    mockGetVerseAudioUnit.mockRejectedValue(new ApiError(404, 'Not found'));
    mockSha256File.mockResolvedValue('a'.repeat(64));
  });

  afterEach(() => {
    authToken.set(null);
  });

  it('reconciles held takes for the active account before uploading (#855)', async () => {
    await syncPendingRecordings('tok-1', { delay });

    expect(mockReconcileHeldRecordings).toHaveBeenCalledWith(2);
  });

  it('uploads pending recordings via FluentAPI and marks uploaded with blob_key', async () => {
    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockGetLatestVersionToken).toHaveBeenCalledWith(42, 12);
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        projectUnitId: 12,
        bibleTextId: 42,
      }),
      'tok-1',
    );
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
      9,
      0,
      expect.any(Object),
    );
    expect(mockMarkRecordingConflicted).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('reports chapter progress, not take counts, for a multi-chapter pass (#600)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'a', bookId: 1, chapterNumber: 1 }),
      pendingRecording({
        id: 'b',
        bookId: 1,
        chapterNumber: 1,
        bibleTextId: 43,
      }),
      pendingRecording({
        id: 'c',
        bookId: 1,
        chapterNumber: 2,
        bibleTextId: 44,
      }),
      pendingRecording({
        id: 'd',
        bookId: 1,
        chapterNumber: 3,
        bibleTextId: 45,
      }),
    ]);

    await syncPendingRecordings('tok-1', { delay });

    expect(mockEmitUploadSessionEvent.mock.calls.map(call => call[0])).toEqual([
      { type: 'start', totalChapters: 3 },
      { type: 'progress', completedChapters: 1, totalChapters: 3 },
      { type: 'progress', completedChapters: 2, totalChapters: 3 },
      { type: 'progress', completedChapters: 3, totalChapters: 3 },
      { type: 'complete' },
    ]);
  });

  it('does not emit session events for a chapter-scoped orchestrator pass (#600)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'a', bookId: 40, chapterNumber: 1 }),
      pendingRecording({
        id: 'b',
        bookId: 40,
        chapterNumber: 1,
        bibleTextId: 43,
      }),
    ]);

    await syncPendingRecordings('tok-1', {
      delay,
      chapter: { bookId: 40, chapterNumber: 1 },
    });

    expect(mockGetPendingRecordings).toHaveBeenCalledWith({
      bookId: 40,
      chapterNumber: 1,
    });
    expect(mockEmitUploadSessionEvent).not.toHaveBeenCalled();
  });

  it('reports per-take progress through onTakeProgress for a chapter-scoped pass (#886)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'a', bookId: 40, chapterNumber: 1 }),
      pendingRecording({
        id: 'b',
        bookId: 40,
        chapterNumber: 1,
        bibleTextId: 43,
      }),
    ]);
    const onTakeProgress = jest.fn();

    await syncPendingRecordings('tok-1', {
      delay,
      chapter: { bookId: 40, chapterNumber: 1 },
      onTakeProgress,
    });

    expect(onTakeProgress.mock.calls.map(call => call[0])).toEqual([
      { completedTakes: 0, failedTakes: 0, totalTakes: 2 },
      { completedTakes: 1, failedTakes: 0, totalTakes: 2 },
      { completedTakes: 2, failedTakes: 0, totalTakes: 2 },
    ]);
    // Session events still belong to the orchestrator.
    expect(mockEmitUploadSessionEvent).not.toHaveBeenCalled();
  });

  it('does not report take progress for an empty chapter pass (#886)', async () => {
    mockGetPendingRecordings.mockResolvedValue([]);
    const onTakeProgress = jest.fn();

    await syncPendingRecordings('tok-1', {
      delay,
      chapter: { bookId: 40, chapterNumber: 1 },
      onTakeProgress,
    });

    expect(onTakeProgress).not.toHaveBeenCalled();
  });

  it('does not count a failed take as a completed chapter (#600)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'ok', bookId: 1, chapterNumber: 1 }),
      pendingRecording({
        id: 'bad',
        bookId: 1,
        chapterNumber: 2,
        projectUnitId: null,
      }),
    ]);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    // A failed take stays pending, so the pass ends `idle`, not `complete`
    // (#886: no success event while work remains).
    expect(mockEmitUploadSessionEvent.mock.calls.map(call => call[0])).toEqual([
      { type: 'start', totalChapters: 2 },
      { type: 'progress', completedChapters: 1, totalChapters: 2 },
      { type: 'idle' },
    ]);
  });

  it('still counts successful chapters when a sibling chapter fails (#600)', async () => {
    mockUploadVerseAudio
      .mockResolvedValueOnce(successResponse())
      .mockRejectedValueOnce(new ApiError(400, 'bad request'));

    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'a', bookId: 1, chapterNumber: 1 }),
      pendingRecording({
        id: 'b',
        bookId: 1,
        chapterNumber: 2,
        bibleTextId: 43,
      }),
    ]);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    // A failed take stays pending, so the pass ends `idle`, not `complete`
    // (#886: no success event while work remains).
    expect(mockEmitUploadSessionEvent.mock.calls.map(call => call[0])).toEqual([
      { type: 'start', totalChapters: 2 },
      { type: 'progress', completedChapters: 1, totalChapters: 2 },
      { type: 'idle' },
    ]);
  });

  it('uploads pericope takes with range fields and marks uploaded (#584)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({
        id: 'rec-pericope',
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 8,
      }),
    ]);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        projectUnitId: 12,
        bibleTextId: 42,
        granularity: 'pericope',
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 8,
      }),
      'tok-1',
    );
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-pericope',
      'unit-12/text-42',
      2,
      9,
      0,
      expect.any(Object),
    );
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('fails pericope takes with a zero/stub range without calling the API (#584)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({
        id: 'rec-bad-range',
        granularity: 'pericope',
        startChapter: 0,
        startVerse: 0,
        endChapter: 0,
        endVerse: 0,
      }),
    ]);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-bad-range',
      expect.stringMatching(/invalid pericope range/i),
      0,
    );
  });

  it('sends baseVersionToken when a prior token exists locally', async () => {
    mockGetLatestVersionToken.mockResolvedValue(3);

    await syncPendingRecordings('tok-1', { delay });

    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.objectContaining({ baseVersionToken: 3 }),
      'tok-1',
    );
  });

  it('marks conflicted when server returns conflictStatus conflict', async () => {
    mockUploadVerseAudio.mockResolvedValue(
      successResponse({ conflictStatus: 'conflict', versionToken: 4 }),
    );

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 1,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockMarkRecordingAndChapterConflicted).toHaveBeenCalledWith(
      'rec-1',
      42,
      4,
      9,
      0,
      expect.any(Object),
    );
    expect(mockMarkRecordingUploaded).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('activates selected and canonical takes and stores other takes inactive (#716)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'sel', isSelected: true }),
      pendingRecording({ id: 'canon', isSelected: false, isCanonical: true }),
      pendingRecording({ id: 'alt', isSelected: false }),
    ]);

    await syncPendingRecordings('tok-1', { delay });

    expect(
      mockUploadVerseAudio.mock.calls.map(
        ([params]) => (params as { activate?: boolean }).activate,
      ),
    ).toEqual([true, true, false]);
  });

  it('uses takeId for a stored-only take and ignores the unit conflict status (#716)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'alt', isSelected: false }),
    ]);
    mockUploadVerseAudio.mockResolvedValue(
      successResponse({ conflictStatus: 'conflict', takeId: 31 }),
    );

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'alt',
      'unit-12/text-42',
      2,
      31,
      0,
      expect.any(Object),
    );
    expect(mockMarkRecordingAndChapterConflicted).not.toHaveBeenCalled();
  });

  it('leaves server take id unknown for a stored-only take when the API omits takeId (#716)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'alt', isSelected: false }),
    ]);
    mockUploadVerseAudio.mockResolvedValue(
      successResponse({ takeId: undefined }),
    );

    await syncPendingRecordings('tok-1', { delay });

    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'alt',
      'unit-12/text-42',
      2,
      null,
      0,
      expect.any(Object),
    );
  });

  describe('queued take deletes (#716)', () => {
    const deletion = {
      id: 'rec-gone',
      projectUnitId: 12,
      bibleTextId: 42,
      serverTakeId: 55,
      recordedByUserId: 7,
    };

    it('deletes queued server takes before uploading and raises the unit token', async () => {
      mockGetPendingRecordingDeletions.mockResolvedValue([deletion]);
      mockGetCredentials.mockResolvedValue({ token: 'owner-tok' });
      const order: string[] = [];
      mockDeleteVerseAudioTake.mockImplementation(async () => {
        order.push('delete');
        return { versionToken: 6 };
      });
      mockUploadVerseAudio.mockImplementation(async () => {
        order.push('upload');
        return successResponse();
      });

      await syncPendingRecordings('tok-1', { delay });

      expect(mockDeleteVerseAudioTake).toHaveBeenCalledWith(
        { projectUnitId: 12, bibleTextId: 42, takeId: 55 },
        'owner-tok',
      );
      expect(mockClearRecordingDeletion).toHaveBeenCalledWith('rec-gone');
      expect(mockRaiseVerseVersionToken).toHaveBeenCalledWith(42, 12, 6);
      expect(order).toEqual(['delete', 'upload']);
    });

    it('treats a 404 as already deleted', async () => {
      mockGetPendingRecordingDeletions.mockResolvedValue([deletion]);
      mockDeleteVerseAudioTake.mockRejectedValue(
        new ApiError(404, 'Not found'),
      );

      await syncPendingRecordings('tok-1', { delay });

      expect(mockClearRecordingDeletion).toHaveBeenCalledWith('rec-gone');
      expect(mockRaiseVerseVersionToken).not.toHaveBeenCalled();
    });

    it('keeps the queue row after retryable failures and still uploads', async () => {
      mockGetPendingRecordingDeletions.mockResolvedValue([deletion]);
      mockDeleteVerseAudioTake.mockRejectedValue(
        new ApiError(500, 'Server error'),
      );

      const result = await syncPendingRecordings('tok-1', { delay });

      expect(mockDeleteVerseAudioTake).toHaveBeenCalledTimes(
        MAX_UPLOAD_ATTEMPTS,
      );
      expect(mockClearRecordingDeletion).not.toHaveBeenCalled();
      expect(result).toEqual({
        uploaded: 1,
        conflicted: 0,
        failed: 0,
        deferred: 0,
        deletionsFailed: 1,
      });
      // Honest terminal event: rows are still pending, so never `complete`.
      expect(mockEmitUploadSessionEvent).not.toHaveBeenCalledWith({
        type: 'complete',
      });
      expect(mockEmitUploadSessionEvent).toHaveBeenLastCalledWith({
        type: 'idle',
      });
    });

    it('chapter passes skip the inline delete scan; the worker drains once per session (#886)', async () => {
      mockGetPendingRecordingDeletions.mockResolvedValue([deletion]);
      mockDeleteVerseAudioTake.mockResolvedValue({ versionToken: 6 });
      const worker = createChapterUploadWorker(() => 'worker-tok');
      const signal = new AbortController().signal;

      await worker.uploadChapter({ bookId: 40, chapterNumber: 1 }, signal);
      expect(mockGetPendingRecordingDeletions).not.toHaveBeenCalled();
      expect(mockDeleteVerseAudioTake).not.toHaveBeenCalled();

      await expect(worker.drainPendingDeletions!(signal)).resolves.toEqual({
        failed: 0,
      });
      expect(mockGetPendingRecordingDeletions).toHaveBeenCalledTimes(1);
      expect(mockDeleteVerseAudioTake).toHaveBeenCalledWith(
        { projectUnitId: 12, bibleTextId: 42, takeId: 55 },
        'worker-tok',
        { signal: expect.any(AbortSignal) },
      );
      expect(mockClearRecordingDeletion).toHaveBeenCalledWith('rec-gone');
      expect(mockRaiseVerseVersionToken).toHaveBeenCalledWith(42, 12, 6);
      // Session events belong to the orchestrator.
      expect(mockEmitUploadSessionEvent).not.toHaveBeenCalled();
    });

    it('drainPendingDeletions reports terminal failures and keeps the rows queued (#886)', async () => {
      mockGetActiveUserId.mockReturnValue('7');
      mockGetPendingRecordingDeletions.mockResolvedValue([
        deletion,
        { ...deletion, id: 'rec-gone-2', serverTakeId: 56 },
      ]);
      mockDeleteVerseAudioTake
        .mockRejectedValueOnce(new ApiError(500, 'Server error'))
        .mockRejectedValueOnce(new ApiError(500, 'Server error'))
        .mockRejectedValueOnce(new ApiError(500, 'Server error'))
        .mockResolvedValueOnce({ versionToken: null });

      await expect(
        drainPendingRecordingDeletions('tok-1', { delay }),
      ).resolves.toEqual({
        attempted: 2,
        deleted: 1,
        failed: 1,
        failedForActiveUser: 1,
      });

      expect(mockDeleteVerseAudioTake).toHaveBeenCalledTimes(
        MAX_UPLOAD_ATTEMPTS + 1,
      );
      expect(mockClearRecordingDeletion).toHaveBeenCalledTimes(1);
      expect(mockClearRecordingDeletion).toHaveBeenCalledWith('rec-gone-2');
    });

    it("another account's stuck delete is counted but does not fail the active user's session (#886)", async () => {
      mockGetActiveUserId.mockReturnValue('7');
      mockGetPendingRecordingDeletions.mockResolvedValue([
        { ...deletion, id: 'mine', recordedByUserId: 7 },
        { ...deletion, id: 'theirs', serverTakeId: 56, recordedByUserId: 9 },
        { ...deletion, id: 'orphan', serverTakeId: 57, recordedByUserId: null },
      ]);
      // 'mine' lands; 'theirs' and 'orphan' are rejected permanently (403).
      mockDeleteVerseAudioTake.mockImplementation(async args =>
        args.takeId === 55
          ? { versionToken: null }
          : Promise.reject(new ApiError(403, 'Forbidden')),
      );

      await expect(
        drainPendingRecordingDeletions('tok-1', { delay }),
      ).resolves.toEqual({
        attempted: 3,
        deleted: 1,
        failed: 2,
        failedForActiveUser: 0,
      });
      const worker = createChapterUploadWorker(() => 'worker-tok');
      await expect(
        worker.drainPendingDeletions!(new AbortController().signal),
      ).resolves.toEqual({ failed: 0 });
    });

    it('drainPendingDeletions surfaces network interruption like takes', async () => {
      mockGetPendingRecordingDeletions.mockResolvedValue([deletion]);
      mockDeleteVerseAudioTake.mockRejectedValue(
        new TypeError('Network request failed'),
      );

      await expect(
        drainPendingRecordingDeletions('tok-1', { delay }),
      ).rejects.toMatchObject({ name: 'UploadNetworkInterruptedError' });
      expect(mockClearRecordingDeletion).not.toHaveBeenCalled();
    });

    it('completes a deletion-only pass once every delete landed', async () => {
      mockGetPendingRecordingDeletions.mockResolvedValue([deletion]);
      mockGetPendingRecordings.mockResolvedValue([]);
      mockDeleteVerseAudioTake.mockResolvedValue({ versionToken: null });

      const result = await syncPendingRecordings('tok-1', { delay });

      expect(result).toEqual({
        uploaded: 0,
        conflicted: 0,
        failed: 0,
        deferred: 0,
        deletionsFailed: 0,
      });
      expect(mockClearRecordingDeletion).toHaveBeenCalledWith('rec-gone');
      expect(mockRaiseVerseVersionToken).not.toHaveBeenCalled();
      expect(mockEmitUploadSessionEvent).toHaveBeenLastCalledWith({
        type: 'complete',
      });
    });

    it('flags reauth for the owner and stops the pass on an auth failure', async () => {
      mockGetPendingRecordingDeletions.mockResolvedValue([deletion]);
      mockGetCredentials.mockResolvedValue({ token: 'owner-tok' });
      mockDeleteVerseAudioTake.mockRejectedValue(new AuthError('expired'));

      await expect(
        syncPendingRecordings('tok-1', { delay }),
      ).rejects.toBeInstanceOf(AuthError);

      expect(mockSetReauthRequired).toHaveBeenCalledWith('7');
      expect(mockClearRecordingDeletion).not.toHaveBeenCalled();
      expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    });
  });

  it('uploads with the recording owner token when credentials exist (#105)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 7 }),
    ]);
    mockGetCredentials.mockResolvedValue({ token: 'owner-tok' });

    await syncPendingRecordings('active-tok', { delay });

    expect(mockGetCredentials).toHaveBeenCalledWith('7');
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'owner-tok',
    );
  });

  it('falls back to the pass token when owner credentials are missing', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 9 }),
    ]);
    mockGetCredentials.mockResolvedValue(null);

    await syncPendingRecordings('pass-tok', { delay });

    expect(mockGetCredentials).toHaveBeenCalledWith('9');
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'pass-tok',
    );
  });

  describe('owner token reuse within one pass (#886)', () => {
    const take = (id: string, recordedByUserId: number | null) =>
      pendingRecording({ id, recordedByUserId, isSelected: false });

    it('reads each owner token once per pass', async () => {
      mockGetPendingRecordings.mockResolvedValue([
        take('rec-1', 7),
        take('rec-2', 7),
        take('rec-3', 8),
        take('rec-4', 7),
      ]);
      mockGetCredentials.mockImplementation(async (id: string) => ({
        token: `owner-${id}`,
      }));

      await syncPendingRecordings('pass-tok', { delay });

      expect(mockGetCredentials.mock.calls.map(c => c[0])).toEqual(['7', '8']);
      expect(mockUploadVerseAudio.mock.calls.map(c => c[1])).toEqual([
        'owner-7',
        'owner-7',
        'owner-8',
        'owner-7',
      ]);
    });

    it('re-reads after the keychain changes mid-pass', async () => {
      mockGetPendingRecordings.mockResolvedValue([
        take('rec-1', 7),
        take('rec-2', 7),
      ]);
      let token = 'old-7';
      mockGetCredentials.mockImplementation(async () => ({ token }));
      mockUploadVerseAudio.mockImplementationOnce(async () => {
        // Re-login for the same account while the first PUT is in flight.
        token = 'new-7';
        mockCredentialsVersion += 1;
        return successResponse();
      });

      await syncPendingRecordings('pass-tok', { delay });

      expect(mockGetCredentials).toHaveBeenCalledTimes(2);
      expect(mockUploadVerseAudio.mock.calls.map(c => c[1])).toEqual([
        'old-7',
        'new-7',
      ]);
    });

    it('re-reads after a take that did not upload', async () => {
      mockGetPendingRecordings.mockResolvedValue([
        take('rec-1', 7),
        take('rec-2', 7),
      ]);
      mockGetCredentials.mockResolvedValue({ token: 'owner-7' });
      mockUploadVerseAudio.mockRejectedValueOnce(
        new ApiError(400, 'bad request'),
      );

      await syncPendingRecordings('pass-tok', { delay });

      expect(mockGetCredentials).toHaveBeenCalledTimes(2);
    });

    it('does not cache the pass-token fallback when owner credentials are missing', async () => {
      mockGetPendingRecordings.mockResolvedValue([
        take('rec-1', 9),
        take('rec-2', 9),
      ]);
      mockGetCredentials
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ token: 'owner-9' });

      await syncPendingRecordings('pass-tok', { delay });

      expect(mockUploadVerseAudio.mock.calls.map(c => c[1])).toEqual([
        'pass-tok',
        'owner-9',
      ]);
    });

    it('does not cache the fallback when the owner is the active user', async () => {
      mockGetActiveUserId.mockReturnValue('9');
      mockGetPendingRecordings.mockResolvedValue([
        take('rec-1', 9),
        take('rec-2', 9),
      ]);
      mockGetCredentials
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ token: 'owner-9' });

      await syncPendingRecordings('pass-tok', { delay });

      expect(mockGetCredentials).toHaveBeenCalledTimes(2);
      expect(mockUploadVerseAudio.mock.calls.map(c => c[1])).toEqual([
        'pass-tok',
        'owner-9',
      ]);
    });

    it('does not carry tokens into the next pass', async () => {
      mockGetPendingRecordings.mockResolvedValue([take('rec-1', 7)]);
      mockGetCredentials.mockResolvedValue({ token: 'owner-7' });

      await syncPendingRecordings('pass-tok', { delay });
      await syncPendingRecordings('pass-tok', { delay });

      expect(mockGetCredentials).toHaveBeenCalledTimes(2);
    });
  });

  it('filters by chapter when provided (orchestrator batching)', async () => {
    await syncPendingRecordings('tok-1', {
      chapter: { bookId: 40, chapterNumber: 3 },
      delay,
    });

    expect(mockGetPendingRecordings).toHaveBeenCalledWith({
      bookId: 40,
      chapterNumber: 3,
    });
  });

  it('marks terminal client failures without retry', async () => {
    mockUploadVerseAudio.mockRejectedValue(new ApiError(400, 'bad request'));

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'bad request',
      0,
    );
  });

  it('treats 503 storage-unconfigured as terminal failure', async () => {
    mockUploadVerseAudio.mockRejectedValue(
      new ApiError(503, 'Storage not configured: missing connection'),
    );

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'Storage not configured: missing connection',
      0,
    );
  });

  it('retries 409 compare-and-swap races then succeeds', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(new ApiError(409, 'concurrent write'))
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(500);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
      9,
      0,
      expect.any(Object),
    );
  });

  it('saves currentVersionToken from 409 before retrying a stored-only upload', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ isSelected: false }),
    ]);
    mockGetLatestVersionToken
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(8);
    mockUploadVerseAudio
      .mockRejectedValueOnce(
        new ApiError(409, 'Conflict', undefined, { currentVersionToken: 8 }),
      )
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUpdateRecordingVersionToken).toHaveBeenCalledWith('rec-1', 8);
    expect(mockGetVerseAudioUnit).not.toHaveBeenCalled();
    expect(mockUploadVerseAudio.mock.calls[0][0]).not.toHaveProperty(
      'baseVersionToken',
    );
    expect(mockUploadVerseAudio).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ baseVersionToken: 8, activate: false }),
      'tok-1',
    );
  });

  it('never adopts a 409 currentVersionToken for an activation; it reconciles under the original precondition', async () => {
    mockGetLatestVersionToken.mockResolvedValue(5);
    mockUploadVerseAudio.mockRejectedValueOnce(
      new ApiError(409, 'Conflict', undefined, { currentVersionToken: 8 }),
    );
    // Another device moved the unit to 8 with a different take active.
    mockGetVerseAudioUnit.mockResolvedValue(
      successResponse({
        versionToken: 8,
        activeTakeId: 30,
        takes: [
          {
            id: 30,
            uploadedBy: 4,
            contentType: 'audio/mp4',
            sizeBytes: 50,
            durationSeconds: 1,
            contentHash: 'b'.repeat(64),
            downloadUrl: 'https://example.test/30',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    );

    await syncPendingRecordings('tok-1', { delay });

    expect(mockUpdateRecordingVersionToken).not.toHaveBeenCalled();
    expect(mockGetLatestVersionToken).toHaveBeenCalledTimes(1);
    // Bytes absent with a precondition: the replay keeps the original base,
    // so the server preserves the newer selection (conflict, not overwrite).
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(2);
    for (const call of mockUploadVerseAudio.mock.calls) {
      expect(call[0]).toMatchObject({ baseVersionToken: 5 });
    }
  });

  describe('activating 200 without takeId (pre-#465 API)', () => {
    const take = (id: number, contentHash: string) => ({
      id,
      uploadedBy: 2,
      contentType: 'audio/mp4',
      sizeBytes: 100,
      durationSeconds: 1.5,
      contentHash,
      downloadUrl: `https://example.test/${id}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    it('confirms the activation when the active take carries the local content hash', async () => {
      mockUploadVerseAudio.mockResolvedValue(
        successResponse({
          takeId: undefined,
          activeTakeId: 9,
          takes: [take(9, 'A'.repeat(64))],
        }),
      );

      const result = await syncPendingRecordings('tok-1', { delay });

      expect(result).toMatchObject({ uploaded: 1, failed: 0 });
      expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
        'rec-1',
        expect.any(String),
        2,
        9,
        0,
        expect.anything(),
      );
    });

    it.each([
      ['another take is active', 'b'.repeat(64)],
      ['the active hash cannot be verified', 'legacy:unit-12/text-42'],
    ])('does not report a selection when %s', async (_label, activeHash) => {
      mockUploadVerseAudio.mockResolvedValue(
        successResponse({
          takeId: undefined,
          activeTakeId: 30,
          takes: [take(30, activeHash)],
        }),
      );

      const result = await syncPendingRecordings('tok-1', { delay });

      expect(result).toMatchObject({ uploaded: 0, failed: 1 });
      expect(mockMarkRecordingUploaded).not.toHaveBeenCalled();
      expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
        'rec-1',
        ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
        0,
        null,
      );
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    });
  });

  it('does not save when 409 lacks currentVersionToken', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(new ApiError(409, 'Conflict', undefined, {}))
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUpdateRecordingVersionToken).not.toHaveBeenCalled();
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(2);
  });

  it('retries retryable failures with backoff then succeeds', async () => {
    mockUploadVerseAudio
      .mockRejectedValueOnce(new ApiError(0, 'network down'))
      .mockRejectedValueOnce(new ApiError(502, 'bad gateway'))
      .mockResolvedValueOnce(successResponse());

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 500);
    expect(delay).toHaveBeenNthCalledWith(2, 1000);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
      9,
      0,
      expect.any(Object),
    );
  });

  it('leaves the take pending after exhausting network errors (#604)', async () => {
    mockUploadVerseAudio.mockRejectedValue(
      new ApiError(
        0,
        'fetch failed: java.net.UnknownHostException: Unable to resolve host "dev.api.fluent.bible": No address associated with hostname',
      ),
    );

    await expect(
      syncPendingRecordings('tok-1', {
        delay,
        maxAttempts: MAX_UPLOAD_ATTEMPTS,
      }),
    ).rejects.toMatchObject({ name: 'UploadNetworkInterruptedError' });

    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(MAX_UPLOAD_ATTEMPTS);
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith(
      'rec-1',
      'pending',
      0,
    );
  });

  it('does not start later takes after a mid-pass network drop (#604)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'rec-1' }),
      pendingRecording({ id: 'rec-2', bibleTextId: 43 }),
    ]);
    mockUploadVerseAudio.mockRejectedValue(new ApiError(0, 'network down'));

    await expect(
      syncPendingRecordings('tok-1', { delay, maxAttempts: 1 }),
    ).rejects.toMatchObject({ name: 'UploadNetworkInterruptedError' });

    expect(mockSetRecordingSyncStatus).not.toHaveBeenCalledWith(
      'rec-2',
      'uploading',
      0,
    );
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('marks failed after exhausting retryable attempts', async () => {
    mockUploadVerseAudio.mockRejectedValue(new ApiError(500, 'server boom'));

    const result = await syncPendingRecordings('tok-1', {
      delay,
      maxAttempts: MAX_UPLOAD_ATTEMPTS,
    });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(MAX_UPLOAD_ATTEMPTS);
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      'server boom',
      0,
    );
  });

  it('marks missing local file as terminal failure', async () => {
    await FileSystem.deleteAsync(FILE_URI);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      expect.stringContaining('Recording file missing'),
      0,
    );
  });

  it('marks missing projectUnitId as terminal failure', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ projectUnitId: null }),
    ]);

    const result = await syncPendingRecordings('tok-1', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'rec-1',
      expect.stringContaining('Missing projectUnitId'),
      0,
    );
  });

  it('resets status and rethrows AuthError without marking failed', async () => {
    mockUploadVerseAudio.mockRejectedValue(new AuthError('session expired'));

    await expect(
      syncPendingRecordings('tok-1', { delay }),
    ).rejects.toBeInstanceOf(AuthError);

    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith(
      'rec-1',
      'pending',
      0,
    );
    expect(mockSetReauthRequired).toHaveBeenCalledWith('2');
    expect(mockEmitAuthReauthRequired).toHaveBeenCalledWith('2');
  });

  it('marks the recording owner for reauth when owner token upload returns 401', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ recordedByUserId: 7 }),
    ]);
    mockGetCredentials.mockResolvedValue({ token: 'owner-tok' });
    mockGetActiveUserId.mockReturnValue('2');
    mockUploadVerseAudio.mockRejectedValue(new AuthError('session expired'));

    await expect(
      syncPendingRecordings('active-tok', { delay }),
    ).rejects.toBeInstanceOf(AuthError);

    expect(mockSetReauthRequired).toHaveBeenCalledWith('7');
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith(
      'rec-1',
      'pending',
      0,
    );
  });

  it('passes the pass signal into the PUT and leaves the row pending when it aborts mid-flight (#886)', async () => {
    const controller = new AbortController();
    mockUploadVerseAudio.mockImplementation(
      async (
        _params: unknown,
        _token: unknown,
        request?: { signal?: AbortSignal },
      ) =>
        new Promise((_resolve, reject) => {
          request?.signal?.addEventListener('abort', () => {
            const error = new Error('Request aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    const pass = syncPendingRecordings('tok-1', {
      delay,
      signal: controller.signal,
    });
    await waitFor(() => expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(pass).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.anything(),
      'tok-1',
      { signal: controller.signal },
    );
    // Not a failure, not a retry: pending for the next pass (server-side
    // acceptance, if any, is covered by content-hash dedupe).
    expect(mockSetRecordingSyncStatus).toHaveBeenLastCalledWith(
      'rec-1',
      'pending',
      0,
    );
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    expect(mockMarkRecordingUploaded).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
  });

  it('passes the pass signal into queued DELETEs and leaves the row queued when it aborts (#886)', async () => {
    const controller = new AbortController();
    mockGetPendingRecordingDeletions.mockResolvedValue([
      {
        id: 'rec-gone',
        projectUnitId: 12,
        bibleTextId: 42,
        serverTakeId: 55,
        recordedByUserId: null,
      },
    ]);
    mockDeleteVerseAudioTake.mockImplementation(
      async (
        _params: unknown,
        _token: unknown,
        request?: { signal?: AbortSignal },
      ) =>
        new Promise((_resolve, reject) => {
          request?.signal?.addEventListener('abort', () => {
            const error = new Error('Request aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    const pass = syncPendingRecordings('tok-1', {
      delay,
      signal: controller.signal,
    });
    await waitFor(() =>
      expect(mockDeleteVerseAudioTake).toHaveBeenCalledTimes(1),
    );
    controller.abort();

    await expect(pass).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockDeleteVerseAudioTake).toHaveBeenCalledWith(
      expect.anything(),
      'tok-1',
      { signal: controller.signal },
    );
    expect(mockClearRecordingDeletion).not.toHaveBeenCalled();
    expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
  });

  it('honors abort signal between recordings and leaves status pending', async () => {
    const controller = new AbortController();
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ id: 'rec-1' }),
      pendingRecording({ id: 'rec-2', bibleTextId: 43 }),
    ]);
    mockUploadVerseAudio.mockImplementation(async () => {
      controller.abort();
      return successResponse();
    });

    await expect(
      syncPendingRecordings('tok-1', { delay, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledWith(
      'rec-1',
      'unit-12/text-42',
      2,
      9,
      0,
      expect.any(Object),
    );
    expect(mockSetRecordingSyncStatus).not.toHaveBeenCalledWith(
      'rec-2',
      'uploading',
      0,
    );
  });

  it('aborts during retry backoff without marking failed', async () => {
    const controller = new AbortController();
    mockUploadVerseAudio.mockRejectedValue(new ApiError(0, 'network'));
    const abortingDelay = jest.fn(async () => {
      controller.abort();
    });

    await expect(
      syncPendingRecordings('tok-1', {
        delay: abortingDelay,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith(
      'rec-1',
      'pending',
      0,
    );
  });

  it('enforces single-flight across overlapping syncPendingRecordings calls', async () => {
    let resolveUpload: (value: unknown) => void = () => undefined;
    mockUploadVerseAudio.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve;
        }),
    );

    const first = syncPendingRecordings('tok-1', { delay });
    // Let the first pass reach FluentAPI before starting the second call.
    await waitFor(() => {
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    });
    const second = syncPendingRecordings('tok-2', { delay });

    resolveUpload(successResponse());
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(b).toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
  });

  it('lets a joining caller abort wait without cancelling the in-flight pass', async () => {
    let resolveUpload: (value: unknown) => void = () => undefined;
    mockUploadVerseAudio.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve;
        }),
    );

    const first = syncPendingRecordings('tok-1', { delay });
    await waitFor(() => {
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    });

    const joiner = new AbortController();
    const second = syncPendingRecordings('tok-2', {
      delay,
      signal: joiner.signal,
    });
    joiner.abort();

    await expect(second).rejects.toMatchObject({ name: 'AbortError' });

    resolveUpload(successResponse());
    await expect(first).resolves.toEqual({
      uploaded: 1,
      conflicted: 0,
      failed: 0,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
  });

  it('requires a non-empty auth token', async () => {
    await expect(syncPendingRecordings('', { delay })).rejects.toThrow(
      /Auth token is required/,
    );
  });

  it('uploadChapterRecordings uses chapter filter and session token', async () => {
    authToken.set('session-tok');
    const controller = new AbortController();

    await uploadChapterRecordings(
      { bookId: 40, chapterNumber: 1 },
      controller.signal,
    );

    expect(mockGetPendingRecordings).toHaveBeenCalledWith({
      bookId: 40,
      chapterNumber: 1,
    });
    expect(mockMarkRecordingUploaded).toHaveBeenCalled();
    expect(mockEmitUploadSessionEvent).not.toHaveBeenCalled();
  });

  it('uploadChapterRecordings throws on failed count like the registered worker', async () => {
    authToken.set('session-tok');
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ projectUnitId: null }),
    ]);
    await expect(
      uploadChapterRecordings(
        { bookId: 40, chapterNumber: 1 },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/Chapter upload failed/);
  });

  it('createChapterUploadWorker registers chapter uploads', async () => {
    const worker = createChapterUploadWorker(() => 'worker-tok');
    const controller = new AbortController();

    await worker.uploadChapter(
      { bookId: 40, chapterNumber: 2 },
      controller.signal,
    );

    expect(mockUploadVerseAudio).toHaveBeenCalledWith(
      expect.any(Object),
      'worker-tok',
      { signal: expect.any(AbortSignal) },
    );
    expect(mockGetPendingRecordings).toHaveBeenCalledWith({
      bookId: 40,
      chapterNumber: 2,
    });
    expect(mockEmitUploadSessionEvent).not.toHaveBeenCalled();
  });

  it('emits one session lifecycle for a direct upload pass', async () => {
    await syncPendingRecordings('tok-1', { delay });

    expect(mockEmitUploadSessionEvent.mock.calls.map(call => call[0])).toEqual([
      { type: 'start', totalChapters: 1 },
      { type: 'progress', completedChapters: 1, totalChapters: 1 },
      { type: 'complete' },
    ]);
  });

  it('createChapterUploadWorker throws when recordings fail so orchestrator can retry (#600)', async () => {
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({ projectUnitId: null }),
    ]);
    const worker = createChapterUploadWorker(() => 'worker-tok');
    await expect(
      worker.uploadChapter(
        { bookId: 40, chapterNumber: 1 },
        new AbortController().signal,
      ),
    ).rejects.toThrow(/Chapter upload failed/);
    expect(mockEmitUploadSessionEvent).not.toHaveBeenCalled();
  });

  it('createChapterUploadWorker does not treat conflicts as chapter failures (#600)', async () => {
    mockUploadVerseAudio.mockResolvedValue(
      successResponse({ conflictStatus: 'conflict', versionToken: 9 }),
    );
    mockGetPendingRecordings.mockResolvedValue([pendingRecording()]);
    const worker = createChapterUploadWorker(() => 'worker-tok');
    await expect(
      worker.uploadChapter(
        { bookId: 40, chapterNumber: 1 },
        new AbortController().signal,
      ),
    ).resolves.toBeUndefined();
  });

  it('registered worker failure keeps pending and retries without complete (#600)', async () => {
    authToken.set('worker-tok');
    mockGetPendingRecordings.mockResolvedValue([
      pendingRecording({
        id: 'bad',
        projectUnitId: null,
        bookId: 40,
        chapterNumber: 1,
      }),
    ]);
    registerRecordingUploadWorker();
    const worker = mockSetChapterUploadWorker.mock.calls.at(-1)?.[0] as
      | ChapterUploadWorker
      | undefined;
    expect(worker?.uploadChapter).toEqual(expect.any(Function));

    const events: UploadSessionEvent[] = [];
    const timers: Array<{
      callback: () => void;
      delayMs: number;
      cancelled: boolean;
    }> = [];
    let conn: ((online: boolean, wifi: boolean) => void) | null = null;
    const pendingChapter = { bookId: 40, chapterNumber: 1 };

    const orchestrator = createUploadOrchestrator({
      subscribeToConnectivity: onChange => {
        conn = onChange;
        return () => undefined;
      },
      getUploadOverCellular: () => false,
      subscribeToUploadOverCellular: () => () => undefined,
      // Chapter stays listed so the session failure is not "empty complete".
      getPendingUploadChapters: async () => [pendingChapter],
      getPausedUntilMs: () => null,
      setPausedUntilMs: () => undefined,
      now: () => 1_000_000,
      pauseWindowMs: PAUSE_WINDOW_MS,
      worker: worker!,
      emit: event => {
        events.push(event);
      },
      schedule: (callback, delayMs) => {
        const timer = { callback, delayMs, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });
    orchestrator.start();
    expect(conn).not.toBeNull();
    conn!(true, true);

    await waitFor(() => {
      expect(events.some(e => e.type === 'idle')).toBe(true);
    });
    expect(events.some(e => e.type === 'complete')).toBe(false);
    expect(events.some(e => e.type === 'cancelled')).toBe(false);
    // Chapter-scoped pass must stay silent (#682).
    expect(mockEmitUploadSessionEvent).not.toHaveBeenCalled();
    expect(timers.filter(t => !t.cancelled).map(t => t.delayMs)).toEqual([
      sessionRetryDelayMs(1),
    ]);
    expect(mockMarkRecordingFailed).toHaveBeenCalledWith(
      'bad',
      expect.stringContaining('Missing projectUnitId'),
      0,
    );
    expect(orchestrator.getSnapshot().phase).toBe('idle');
  });

  it('registerRecordingUploadWorker wires setChapterUploadWorker', () => {
    registerRecordingUploadWorker();
    expect(mockSetChapterUploadWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadChapter: expect.any(Function),
      }),
    );
  });

  it('does not invent R2 /recordings/sync paths', async () => {
    await syncPendingRecordings('tok-1', { delay });
    const call = mockUploadVerseAudio.mock.calls[0][0];
    expect(JSON.stringify(call)).not.toMatch(/recordings\/sync/);
    expect(JSON.stringify(call)).not.toMatch(/R2_/);
  });

  it('does not send a PUT when cancellation arrives during the local version-token lookup', async () => {
    const controller = new AbortController();
    let finishVersion!: (value: number) => void;
    const version = new Promise<number>(resolve => {
      finishVersion = resolve;
    });
    mockGetLatestVersionToken.mockImplementationOnce(() => version);
    const pass = syncPendingRecordings('pass-token', {
      delay,
      signal: controller.signal,
    });
    await waitFor(() =>
      expect(mockGetLatestVersionToken).toHaveBeenCalledTimes(1),
    );
    controller.abort();
    finishVersion(2);

    await expect(pass).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockUploadVerseAudio).not.toHaveBeenCalled();
    expect(mockSetRecordingSyncStatus).toHaveBeenCalledWith(
      'rec-1',
      'pending',
      0,
    );
    expect(mockMarkRecordingUploaded).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
  });

  it('does not retry a server-accepted conflict when its local atomic marker fails', async () => {
    mockUploadVerseAudio.mockResolvedValue(
      successResponse({ conflictStatus: 'conflict', versionToken: 4 }),
    );
    mockMarkRecordingAndChapterConflicted.mockRejectedValueOnce(
      new Error('local transaction unavailable'),
    );

    const result = await syncPendingRecordings('pass-token', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(mockMarkRecordingAndChapterConflicted).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
    expect(mockMarkRecordingUploaded).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    // The acceptance survived as a durable receipt (#886).
    expect(mockReceipts.get('rec-1')).toMatchObject({
      kind: 'conflicted',
      versionToken: 4,
      serverTakeId: 9,
    });
  });

  it('does not repeat an accepted clean PUT when the local uploaded marker fails', async () => {
    mockMarkRecordingUploaded.mockRejectedValue(
      new Error('local uploaded marker unavailable'),
    );

    const result = await syncPendingRecordings('pass-token', { delay });

    expect(result).toEqual({
      uploaded: 0,
      conflicted: 0,
      failed: 1,
      deferred: 0,
      deletionsFailed: 0,
    });
    expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
    expect(mockMarkRecordingUploaded).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
    expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    expect(mockReceipts.get('rec-1')).toMatchObject({
      kind: 'uploaded',
      versionToken: 2,
      serverTakeId: 9,
      blobKey: expect.any(String),
    });
  });

  describe('durable upload receipts (#886)', () => {
    it('reconciles the marker from the receipt on the next pass without a second PUT', async () => {
      mockMarkRecordingUploaded.mockRejectedValueOnce(
        new Error('local uploaded marker unavailable'),
      );

      const first = await syncPendingRecordings('pass-token', { delay });
      expect(first.failed).toBe(1);
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);

      __resetRecordingSyncForTests();
      const second = await syncPendingRecordings('pass-token', { delay });

      expect(second).toEqual({
        uploaded: 1,
        conflicted: 0,
        failed: 0,
        deferred: 0,
        deletionsFailed: 0,
      });
      // Exactly one PUT across both passes; the second pass only wrote the marker.
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
      expect(mockMarkRecordingUploaded).toHaveBeenCalledTimes(2);
      expect(mockMarkRecordingUploaded).toHaveBeenLastCalledWith(
        'rec-1',
        expect.any(String),
        2,
        9,
        0,
        expect.any(Object),
      );
      expect(mockReceipts.has('rec-1')).toBe(false);
    });

    it.each(['marker-failed', 'marker-committed-before-clear'])(
      'does not consume a newer selection after %s',
      async crashPoint => {
        const current = pendingRecording({
          isSelected: false,
          uploadIntentVersion: 0,
        });
        mockGetPendingRecordings.mockResolvedValue([current]);
        if (crashPoint === 'marker-failed') {
          mockMarkRecordingUploaded.mockRejectedValueOnce(
            new Error('SQLite unavailable'),
          );
          await syncPendingRecordings('pass-token', { delay });
        } else {
          // The old marker committed, then the process died before clearing KV.
          mockReceipts.set(current.id, {
            recordingId: current.id,
            uploadIntentVersion: 0,
            kind: 'uploaded',
            bibleTextId: 42,
            blobKey: 'accepted',
            versionToken: 2,
            serverTakeId: 9,
          });
        }
        current.isSelected = true;
        current.uploadIntentVersion = 1;
        mockMarkRecordingUploaded.mockResolvedValue(true);
        mockMarkRecordingUploaded.mockResolvedValueOnce(false);
        const before = mockUploadVerseAudio.mock.calls.length;
        __resetRecordingSyncForTests();
        const result = await syncPendingRecordings('pass-token', { delay });
        expect(mockUploadVerseAudio).toHaveBeenCalledTimes(before + 1);
        expect(mockUploadVerseAudio.mock.calls.at(-1)?.[0]).toMatchObject({
          activate: true,
        });
        expect(mockMarkRecordingUploaded).toHaveBeenLastCalledWith(
          current.id,
          expect.any(String),
          2,
          9,
          1,
          expect.any(Object),
        );
        expect(result.uploaded).toBe(1);
        expect(mockReceipts.has(current.id)).toBe(false);
        expect(mockReceipts.has(`unbound:${current.id}`)).toBe(true);
      },
    );

    it('defers instead of crediting a marker when selection changes during the request', async () => {
      mockMarkRecordingUploaded.mockResolvedValueOnce(false);
      const result = await syncPendingRecordings('pass-token', { delay });
      expect(result).toMatchObject({ uploaded: 0, failed: 0, deferred: 1 });
      expect(mockReceipts.has('rec-1')).toBe(false);
      expect(mockReceipts.get('unbound:rec-1')).toMatchObject({
        serverTakeId: 9,
      });
    });

    it('reconciles a conflicted receipt with the chapter conflict marker', async () => {
      mockUploadVerseAudio.mockResolvedValue(
        successResponse({ conflictStatus: 'conflict', versionToken: 4 }),
      );
      mockMarkRecordingAndChapterConflicted.mockRejectedValueOnce(
        new Error('local transaction unavailable'),
      );
      await syncPendingRecordings('pass-token', { delay });

      __resetRecordingSyncForTests();
      const second = await syncPendingRecordings('pass-token', { delay });

      expect(second.conflicted).toBe(1);
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
      expect(mockMarkRecordingAndChapterConflicted).toHaveBeenLastCalledWith(
        'rec-1',
        42,
        4,
        9,
        0,
        expect.any(Object),
      );
      expect(mockReceipts.has('rec-1')).toBe(false);
    });

    it('keeps the receipt when reconciliation fails again and still sends no PUT', async () => {
      mockMarkRecordingUploaded.mockRejectedValue(
        new Error('local uploaded marker unavailable'),
      );
      await syncPendingRecordings('pass-token', { delay });

      __resetRecordingSyncForTests();
      const second = await syncPendingRecordings('pass-token', { delay });

      // A receipt exists, so the PUT is never replayed; the row stays
      // pending with the receipt for a later pass.
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
      expect(mockMarkRecordingUploaded).toHaveBeenCalledTimes(2);
      expect(mockReceipts.has('rec-1')).toBe(true);
      expect(second.failed).toBe(1);
      expect(mockMarkRecordingFailed).not.toHaveBeenCalled();
    });

    it('falls back to the replay/dedupe contract when the receipt write itself fails', async () => {
      mockReceiptWriteFails = true;
      mockMarkRecordingUploaded.mockRejectedValueOnce(
        new Error('local uploaded marker unavailable'),
      );
      await syncPendingRecordings('pass-token', { delay });
      expect(mockReceipts.size).toBe(0);

      __resetRecordingSyncForTests();
      mockReceiptWriteFails = false;
      const second = await syncPendingRecordings('pass-token', { delay });

      // No receipt → the PUT is replayed; the server dedupes on content hash.
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(2);
      expect(second.uploaded).toBe(1);
    });

    it('a successful upload leaves no receipt behind', async () => {
      await syncPendingRecordings('pass-token', { delay });
      expect(mockReceipts.size).toBe(0);
    });

    it('keeps a conflicted receipt when its reconciliation fails again', async () => {
      mockUploadVerseAudio.mockResolvedValue(
        successResponse({ conflictStatus: 'conflict', versionToken: 4 }),
      );
      mockMarkRecordingAndChapterConflicted.mockRejectedValue(
        new Error('local transaction unavailable'),
      );
      await syncPendingRecordings('pass-token', { delay });

      __resetRecordingSyncForTests();
      const second = await syncPendingRecordings('pass-token', { delay });

      expect(second.failed).toBe(1);
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
      expect(mockMarkRecordingAndChapterConflicted).toHaveBeenCalledTimes(2);
      expect(mockReceipts.get('rec-1')).toMatchObject({ kind: 'conflicted' });
    });

    it('does not reconcile when the pass is already aborted', async () => {
      mockMarkRecordingUploaded.mockRejectedValueOnce(
        new Error('local uploaded marker unavailable'),
      );
      await syncPendingRecordings('pass-token', { delay });
      expect(mockMarkRecordingUploaded).toHaveBeenCalledTimes(1);

      __resetRecordingSyncForTests();
      const controller = new AbortController();
      controller.abort();
      await expect(
        syncPendingRecordings('pass-token', {
          delay,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      // No marker rewrite, no PUT, receipt still there for a later pass.
      expect(mockMarkRecordingUploaded).toHaveBeenCalledTimes(1);
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);
      expect(mockReceipts.has('rec-1')).toBe(true);
    });

    it('still uses the pass token when the owner credentials are missing (#854 unchanged)', async () => {
      mockGetPendingRecordings.mockResolvedValue([
        pendingRecording({ recordedByUserId: 7 }),
      ]);
      mockGetCredentials.mockResolvedValue(null);

      await syncPendingRecordings('pass-token', { delay });

      expect(mockUploadVerseAudio).toHaveBeenCalledWith(
        expect.anything(),
        'pass-token',
      );
    });
  });
});
