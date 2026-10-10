import { renderHook, waitFor, act } from '@testing-library/react-native';
import { loadPendingUploadCount, usePendingUploads } from './usePendingUploads';
import {
  emitRecordingDataChanged,
  getRecordingDataVersion,
} from '../services/recordingDataEvents';
import { emitUploadSessionEvent } from '../services/syncEvents';
import {
  EMPTY_SYNC_STATUS_SNAPSHOT,
  getSyncStatusSnapshot,
  refreshSyncStatusStore,
  resetSyncStatusStore,
  resetSyncStatusStoreForTests,
  subscribeToSyncStatusStore,
} from '../services/syncStatusStore';

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getPendingUploadCount: jest.fn(),
  getFailedUploadCount: jest.fn(),
  getFailedUploadErrorSummary: jest.fn(),
  getPendingUploadChapters: jest.fn(),
  getUnuploadablePendingSummary: jest.fn(),
}));

import {
  getFailedUploadCount,
  getFailedUploadErrorSummary,
  getPendingUploadChapters,
  getPendingUploadCount,
  getUnuploadablePendingSummary,
} from '../db/queries';
import { useFocusEffect } from 'expo-router';

const mockGetPendingUploadCount = getPendingUploadCount as jest.MockedFunction<
  typeof getPendingUploadCount
>;
const mockGetFailedUploadCount = getFailedUploadCount as jest.MockedFunction<
  typeof getFailedUploadCount
>;
const mockGetFailedUploadErrorSummary =
  getFailedUploadErrorSummary as jest.MockedFunction<
    typeof getFailedUploadErrorSummary
  >;
const mockGetPendingUploadChapters =
  getPendingUploadChapters as jest.MockedFunction<
    typeof getPendingUploadChapters
  >;
const mockGetUnuploadablePendingSummary =
  getUnuploadablePendingSummary as jest.MockedFunction<
    typeof getUnuploadablePendingSummary
  >;

const mockUseFocusEffect = useFocusEffect as jest.Mock;

/** Fire the focus callback the hook registered (simulate screen focus). */
function fireFocusEffect(): void {
  const effect = mockUseFocusEffect.mock.calls.at(-1)?.[0] as
    | (() => void | (() => void))
    | undefined;
  act(() => {
    effect?.();
  });
}

/** A promise the test resolves by hand, to hold a query in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('usePendingUploads (shared sync-status store)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetSyncStatusStoreForTests();
    mockGetPendingUploadCount.mockResolvedValue(0);
    mockGetFailedUploadCount.mockResolvedValue(0);
    mockGetFailedUploadErrorSummary.mockResolvedValue(null);
    mockGetPendingUploadChapters.mockResolvedValue([]);
    mockGetUnuploadablePendingSummary.mockResolvedValue({
      orphanBibleText: 0,
      pericopeOnly: 0,
      other: 0,
      total: 0,
    });
  });

  it('loadPendingUploadCount returns the query count', async () => {
    mockGetPendingUploadCount.mockResolvedValue(3);
    await expect(loadPendingUploadCount()).resolves.toBe(3);
  });

  it('loadPendingUploadCount rejects on failure', async () => {
    mockGetPendingUploadCount.mockRejectedValue(new Error('db'));
    await expect(loadPendingUploadCount()).rejects.toThrow('db');
  });

  it('loads counts from the shared store on mount', async () => {
    mockGetPendingUploadCount.mockResolvedValue(2);
    mockGetFailedUploadCount.mockResolvedValue(1);
    mockGetPendingUploadChapters.mockResolvedValue([
      { bookId: 1, chapterNumber: 1 },
    ]);

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
      expect(result.current.pendingChapterCount).toBe(1);
      expect(result.current.hasPendingUploads).toBe(true);
      expect(result.current.failedCount).toBe(1);
      expect(result.current.hasFailedUploads).toBe(true);
      expect(result.current.failedErrorText).toBeNull();
    });
  });

  it('re-reads when a take is saved (recording data changed)', async () => {
    mockGetPendingUploadCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(0);
    });

    const versionBefore = getRecordingDataVersion();
    act(() => {
      emitRecordingDataChanged();
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });
    expect(getRecordingDataVersion()).toBe(versionBefore + 1);
  });

  it('re-reads when a take is deleted (recording data changed)', async () => {
    mockGetPendingUploadCount.mockResolvedValue(1);

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.hasPendingUploads).toBe(true);
    });

    mockGetPendingUploadCount.mockResolvedValue(0);
    act(() => {
      emitRecordingDataChanged();
    });

    await waitFor(() => {
      expect(result.current.hasPendingUploads).toBe(false);
    });
  });

  it('re-reads when a failed take is deleted and clears failedErrorText', async () => {
    mockGetFailedUploadCount.mockResolvedValue(1);
    mockGetFailedUploadErrorSummary.mockResolvedValue({
      latestMessage: 'Audio storage is unavailable',
      extraDistinctCount: 0,
    });

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.hasFailedUploads).toBe(true);
      expect(result.current.failedErrorText).toBe(
        'Audio storage is currently unavailable. Try again later.',
      );
    });

    mockGetFailedUploadCount.mockResolvedValue(0);
    mockGetFailedUploadErrorSummary.mockResolvedValue(null);
    act(() => {
      emitRecordingDataChanged();
    });

    await waitFor(() => {
      expect(result.current.failedCount).toBe(0);
      expect(result.current.failedErrorText).toBeNull();
    });
  });

  it('re-reads on focus', async () => {
    mockGetPendingUploadCount.mockResolvedValueOnce(0).mockResolvedValueOnce(3);

    renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(mockGetPendingUploadCount).toHaveBeenCalledTimes(1);
    });

    fireFocusEffect();

    await waitFor(() => {
      expect(mockGetPendingUploadCount).toHaveBeenCalledTimes(2);
    });
  });

  it('re-reads when refreshKey changes', async () => {
    mockGetPendingUploadCount.mockResolvedValue(0);

    const { rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => usePendingUploads(refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => {
      expect(mockGetPendingUploadCount).toHaveBeenCalledTimes(1);
    });

    rerender({ refreshKey: 1 });

    await waitFor(() => {
      expect(mockGetPendingUploadCount).toHaveBeenCalledTimes(2);
    });
  });

  it('does not re-read when refreshKey is unchanged', async () => {
    mockGetPendingUploadCount.mockResolvedValue(0);

    const { rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => usePendingUploads(refreshKey),
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => {
      expect(mockGetPendingUploadCount).toHaveBeenCalledTimes(1);
    });

    rerender({ refreshKey: 0 });

    expect(mockGetPendingUploadCount).toHaveBeenCalledTimes(1);
  });

  it('refreshes counts when upload session events fire', async () => {
    mockGetPendingUploadCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });

    act(() => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 3 });
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(true);
      expect(result.current.uploadProgress).toEqual({
        completed: 0,
        total: 3,
      });
      expect(result.current.pendingCount).toBe(1);
    });

    act(() => {
      emitUploadSessionEvent({
        type: 'progress',
        completedChapters: 2,
        totalChapters: 3,
      });
    });

    await waitFor(() => {
      expect(result.current.uploadProgress).toEqual({
        completed: 2,
        total: 3,
      });
    });

    act(() => {
      emitUploadSessionEvent({ type: 'complete' });
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(false);
      expect(result.current.uploadProgress).toBeNull();
    });
  });

  it('does not flash stale pending counts when the upload completes (#621)', async () => {
    mockGetPendingUploadCount.mockResolvedValueOnce(2); // initial load

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(2);
    });

    act(() => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 2 });
    });
    await waitFor(() => {
      expect(result.current.isUploading).toBe(true);
    });

    // Worker marks a row uploaded; the event-triggered re-read sees 1 left.
    mockGetPendingUploadCount.mockResolvedValue(1);
    act(() => {
      emitUploadSessionEvent({
        type: 'progress',
        completedChapters: 1,
        totalChapters: 2,
      });
    });
    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });

    // `complete` fires; the final re-read still has to resolve. Until it
    // does, no snapshot may commit isUploading=false with the stale count —
    // that frame is what made the header flash "pending" (QA #621).
    mockGetPendingUploadCount.mockResolvedValue(0);
    const snapshots: Array<{ isUploading: boolean; pendingCount: number }> = [];
    const unsubscribe = subscribeToSyncStatusStore(() => {
      const s = getSyncStatusSnapshot();
      snapshots.push({
        isUploading: s.isUploading,
        pendingCount: s.pendingCount,
      });
    });
    try {
      act(() => {
        emitUploadSessionEvent({ type: 'complete' });
      });
      await waitFor(() => {
        expect(result.current.isUploading).toBe(false);
        expect(result.current.uploadProgress).toBeNull();
        expect(result.current.pendingCount).toBe(0);
      });
    } finally {
      unsubscribe();
    }

    for (const s of snapshots) {
      if (!s.isUploading) {
        expect(s.pendingCount).toBe(0);
      }
    }
  });

  it('flips isUploading off immediately on paused/waiting_wifi and keeps progress', async () => {
    const { result } = renderHook(() => usePendingUploads(0));

    act(() => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 2 });
    });
    await waitFor(() => {
      expect(result.current.isUploading).toBe(true);
    });

    act(() => {
      emitUploadSessionEvent({ type: 'paused', reason: 'connectivity' });
    });
    expect(result.current.isUploading).toBe(false);
    expect(result.current.uploadProgress).toEqual({ completed: 0, total: 2 });

    act(() => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 2 });
    });
    await waitFor(() => {
      expect(result.current.isUploading).toBe(true);
    });

    act(() => {
      emitUploadSessionEvent({ type: 'waiting_wifi' });
    });
    expect(result.current.isUploading).toBe(false);
  });

  it('marks counts unknown when a pending query fails instead of treating it as zero', async () => {
    mockGetPendingUploadCount.mockRejectedValue(new Error('db'));
    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.countsUnknown).toBe(true);
      expect(result.current.hasPendingUploads).toBe(false);
    });
  });

  it('marks counts unknown when the unuploadable summary query fails', async () => {
    mockGetUnuploadablePendingSummary.mockRejectedValue(new Error('db'));
    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.countsUnknown).toBe(true);
    });
  });

  it('exposes unuploadable pending when count is 0 but leftover takes remain', async () => {
    mockGetPendingUploadCount.mockResolvedValue(0);
    mockGetUnuploadablePendingSummary.mockResolvedValue({
      orphanBibleText: 1,
      pericopeOnly: 2,
      other: 0,
      total: 3,
    });

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.unuploadableCount).toBe(3);
      expect(result.current.hasUnuploadablePending).toBe(true);
      expect(result.current.hasPendingUploads).toBe(false);
      expect(result.current.pendingChapterCount).toBe(0);
    });
  });

  it('keeps unuploadable visible when pendingCount>0 but chapters are empty', async () => {
    mockGetPendingUploadCount.mockResolvedValue(3);
    mockGetPendingUploadChapters.mockResolvedValue([]);
    mockGetUnuploadablePendingSummary.mockResolvedValue({
      orphanBibleText: 3,
      pericopeOnly: 0,
      other: 0,
      total: 3,
    });

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
      expect(result.current.pendingChapterCount).toBe(0);
      expect(result.current.unuploadableCount).toBe(3);
      expect(result.current.hasUnuploadablePending).toBe(true);
    });
  });

  it('keeps failedErrorText hidden until failed rows exist', async () => {
    mockGetFailedUploadCount.mockResolvedValue(0);
    mockGetFailedUploadErrorSummary.mockResolvedValue({
      latestMessage: 'Audio storage is unavailable',
      extraDistinctCount: 2,
    });

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.failedCount).toBe(0);
      expect(result.current.failedErrorText).toBeNull();
    });
  });

  it('shares one snapshot between two mounted consumers', async () => {
    mockGetPendingUploadCount.mockResolvedValue(4);

    const first = renderHook(() => usePendingUploads(0));
    const second = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(first.result.current.pendingCount).toBe(4);
      expect(second.result.current.pendingCount).toBe(4);
    });

    // One emit updates both consumers without extra query calls.
    mockGetPendingUploadCount.mockResolvedValue(2);
    const callsBefore = mockGetPendingUploadCount.mock.calls.length;
    act(() => {
      emitRecordingDataChanged();
    });

    await waitFor(() => {
      expect(first.result.current.pendingCount).toBe(2);
      expect(second.result.current.pendingCount).toBe(2);
    });
    expect(mockGetPendingUploadCount.mock.calls.length - callsBefore).toBe(1);
  });

  it('resetSyncStatusStore clears mounted consumers (user switch)', async () => {
    mockGetPendingUploadCount.mockResolvedValue(4);

    const { result } = renderHook(() => usePendingUploads(0));
    await waitFor(() => {
      expect(result.current.pendingCount).toBe(4);
    });

    act(() => {
      resetSyncStatusStore();
    });

    expect(result.current.pendingCount).toBe(0);
    expect(result.current.hasPendingUploads).toBe(false);
  });
});

describe('refreshSyncStatusStore', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetSyncStatusStoreForTests();
    mockGetPendingUploadCount.mockResolvedValue(0);
    mockGetFailedUploadCount.mockResolvedValue(0);
    mockGetFailedUploadErrorSummary.mockResolvedValue(null);
    mockGetPendingUploadChapters.mockResolvedValue([]);
    mockGetUnuploadablePendingSummary.mockResolvedValue({
      orphanBibleText: 0,
      pericopeOnly: 0,
      other: 0,
      total: 0,
    });
  });

  it('only commits the newest generation when calls race', async () => {
    // First refresh resolves last (slow), second resolves first (fast).
    mockGetPendingUploadCount
      .mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve(9), 30)),
      )
      .mockResolvedValueOnce(1);

    await Promise.all([refreshSyncStatusStore(), refreshSyncStatusStore()]);

    expect(getSyncStatusSnapshot().pendingCount).toBe(1);
  });

  it('ends the upload when the final refresh rejects instead of wedging (#621)', async () => {
    const { result } = renderHook(() => usePendingUploads(0));

    act(() => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
    });
    await waitFor(() => {
      expect(result.current.isUploading).toBe(true);
    });

    mockGetPendingUploadCount.mockRejectedValueOnce(new Error('db gone'));
    act(() => {
      emitUploadSessionEvent({ type: 'complete' });
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(false);
    });
    expect(result.current.uploadProgress).toBeNull();

    // A later re-read still lands the counts.
    mockGetPendingUploadCount.mockResolvedValue(0);
    await act(async () => {
      await refreshSyncStatusStore();
    });
    expect(getSyncStatusSnapshot().pendingCount).toBe(0);
  });

  it('does not throw when a count query rejects', async () => {
    mockGetPendingUploadChapters.mockRejectedValue(new Error('db gone'));

    await expect(refreshSyncStatusStore()).resolves.toBeUndefined();
  });

  it('resetSyncStatusStore returns the empty snapshot', async () => {
    mockGetPendingUploadCount.mockResolvedValue(5);
    await refreshSyncStatusStore();
    expect(getSyncStatusSnapshot().pendingCount).toBe(5);

    resetSyncStatusStore();

    expect(getSyncStatusSnapshot()).toBe(EMPTY_SYNC_STATUS_SNAPSHOT);
  });

  it('drops a refresh that was in flight when the store was reset', async () => {
    const gate = deferred<number>();
    mockGetPendingUploadCount.mockReturnValue(gate.promise);
    const inFlight = refreshSyncStatusStore();

    resetSyncStatusStore();
    gate.resolve(9);
    await inFlight;

    expect(getSyncStatusSnapshot()).toBe(EMPTY_SYNC_STATUS_SNAPSHOT);
  });

  it('does not expose isUploading false with pre-upload pendingCount after complete', async () => {
    let resolveCompletePending: (count: number) => void = () => {};
    const completePending = new Promise<number>(resolve => {
      resolveCompletePending = resolve;
    });

    mockGetPendingUploadCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockReturnValueOnce(completePending);

    const snapshots: Array<{
      isUploading: boolean;
      pendingCount: number;
    }> = [];
    const { result } = renderHook(() => {
      const value = usePendingUploads(0);
      snapshots.push({
        isUploading: value.isUploading,
        pendingCount: value.pendingCount,
      });
      return value;
    });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });

    act(() => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 3 });
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(true);
      expect(result.current.pendingCount).toBe(3);
    });

    snapshots.length = 0;

    act(() => {
      emitUploadSessionEvent({ type: 'complete' });
    });

    expect(result.current.isUploading).toBe(true);
    expect(result.current.pendingCount).toBe(3);
    expect(
      snapshots.some(
        snapshot => !snapshot.isUploading && snapshot.pendingCount === 3,
      ),
    ).toBe(false);

    await act(async () => {
      resolveCompletePending(0);
    });

    await waitFor(() => {
      expect(result.current.isUploading).toBe(false);
      expect(result.current.pendingCount).toBe(0);
    });
  });
});
