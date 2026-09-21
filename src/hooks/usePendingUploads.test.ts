import { act, renderHook, waitFor } from '@testing-library/react-native';
import { loadPendingUploadCount, usePendingUploads } from './usePendingUploads';
import { emitUploadSessionEvent } from '../services/syncEvents';

jest.mock('../db/queries', () => ({
  getPendingUploadCount: jest.fn(),
  getFailedUploadCount: jest.fn(),
  getFailedUploadErrorSummary: jest.fn(),
  getPendingUploadChapters: jest.fn(),
}));

import {
  getFailedUploadCount,
  getFailedUploadErrorSummary,
  getPendingUploadChapters,
  getPendingUploadCount,
} from '../db/queries';

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

describe('usePendingUploads', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetPendingUploadCount.mockResolvedValue(0);
    mockGetFailedUploadCount.mockResolvedValue(0);
    mockGetFailedUploadErrorSummary.mockResolvedValue(null);
    mockGetPendingUploadChapters.mockResolvedValue([]);
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
      expect(result.current.failedErrorText).toBeNull();
    });
  });

  it('surfaces sanitized failed upload error text from the summary query', async () => {
    mockGetFailedUploadCount.mockResolvedValue(1);
    mockGetFailedUploadErrorSummary.mockResolvedValue({
      message:
        'Local file missing: /data/user/0/com.eten.fluent/files/recordings/rec_abc.m4a',
      count: 1,
    });
    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.hasFailedUploads).toBe(true);
      expect(result.current.failedErrorText).toBe('Local file missing');
    });
  });

  it('keeps (+N more) after sanitizing the latest message', async () => {
    mockGetFailedUploadCount.mockResolvedValue(3);
    mockGetFailedUploadErrorSummary.mockResolvedValue({
      message: 'Audio storage is unavailable (+1 more)',
      count: 3,
    });
    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.failedErrorText).toBe(
        'Audio storage is currently unavailable. Try again later. (+1 more)',
      );
    });
  });

  it('clears failedErrorText after a successful retry refresh', async () => {
    mockGetFailedUploadCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mockGetFailedUploadErrorSummary
      .mockResolvedValueOnce({
        message: 'Audio storage is unavailable',
        count: 1,
      })
      .mockResolvedValueOnce(null);

    const { result } = renderHook(() => usePendingUploads(0));

    await waitFor(() => {
      expect(result.current.failedErrorText).toBe(
        'Audio storage is currently unavailable. Try again later.',
      );
    });

    act(() => {
      emitUploadSessionEvent({ type: 'complete' });
    });

    await waitFor(() => {
      expect(result.current.failedCount).toBe(0);
      expect(result.current.hasFailedUploads).toBe(false);
      expect(result.current.failedErrorText).toBeNull();
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
