import { act, renderHook, waitFor } from '@testing-library/react-native';
import { loadPendingUploadCount, usePendingUploads } from './usePendingUploads';
import { emitUploadSessionEvent } from '../services/syncEvents';

jest.mock('../db/queries', () => ({
  getPendingUploadCount: jest.fn(),
  getFailedUploadCount: jest.fn(),
  getPendingUploadChapters: jest.fn(),
  getUnuploadablePendingSummary: jest.fn(),
}));

import {
  getFailedUploadCount,
  getPendingUploadChapters,
  getPendingUploadCount,
  getUnuploadablePendingSummary,
} from '../db/queries';

const mockGetPendingUploadCount = getPendingUploadCount as jest.MockedFunction<
  typeof getPendingUploadCount
>;
const mockGetFailedUploadCount = getFailedUploadCount as jest.MockedFunction<
  typeof getFailedUploadCount
>;
const mockGetPendingUploadChapters =
  getPendingUploadChapters as jest.MockedFunction<
    typeof getPendingUploadChapters
  >;
const mockGetUnuploadablePendingSummary =
  getUnuploadablePendingSummary as jest.MockedFunction<
    typeof getUnuploadablePendingSummary
  >;

describe('usePendingUploads', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetPendingUploadCount.mockResolvedValue(0);
    mockGetFailedUploadCount.mockResolvedValue(0);
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

  it('loadPendingUploadCount returns 0 on failure', async () => {
    mockGetPendingUploadCount.mockRejectedValue(new Error('db'));
    await expect(loadPendingUploadCount()).resolves.toBe(0);
  });

  it('exposes pending and failed counts from the queries', async () => {
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
    });
  });

  it('exposes unuploadable pending when count is 0 but leftover takes remain', async () => {
    mockGetPendingUploadCount.mockResolvedValue(0);
    mockGetPendingUploadChapters.mockResolvedValue([]);
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

  it('refreshes counts when upload session events fire', async () => {
    mockGetPendingUploadCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    mockGetFailedUploadCount.mockResolvedValue(0);

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
});
