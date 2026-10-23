const mockGetDraftDownloadState = jest.fn();
const mockStartDraftDownload = jest.fn();
const mockOnDownloadQueueChanged = jest.fn(
  (_listener: unknown) => () => undefined,
);

jest.mock('../services/draftDownload', () => ({
  getDraftDownloadState: (...args: unknown[]) =>
    mockGetDraftDownloadState(...args),
  startDraftDownload: (...args: unknown[]) => mockStartDraftDownload(...args),
}));

jest.mock('../utils/downloadQueueEvents', () => ({
  onDownloadQueueChanged: (listener: unknown) =>
    mockOnDownloadQueueChanged(listener),
}));
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DraftDownloadRequest } from '../types/draftDownload/types';
import { useDraftDownload } from './useDraftDownload';

const request: DraftDownloadRequest = {
  chapterAssignmentId: 9,
  projectUnitId: 12,
  projectId: 1,
  userId: 7,
  bibleId: 1,
  bookId: 41,
  bookCode: 'MRK',
  chapterNumber: 1,
  role: 'peer_check',
};

describe('useDraftDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnDownloadQueueChanged.mockReturnValue(() => undefined);
  });

  it('coalesces overlapping refresh polls into one getDraftDownloadState flight', async () => {
    let resolveFirst!: (value: unknown) => void;
    mockGetDraftDownloadState.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFirst = resolve;
        }),
    );

    const { result } = renderHook(() => useDraftDownload(request));

    await waitFor(() => {
      expect(mockGetDraftDownloadState).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      void result.current.refresh();
      void result.current.refresh();
    });
    expect(mockGetDraftDownloadState).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({
        chapterAssignmentId: 9,
        role: 'peer_check',
        status: 'downloading',
        phase: 'audio',
        progress: 0.4,
        readyAtMs: null,
      });
    });

    await waitFor(() => {
      // Trailing coalesced refresh after the first flight settles.
      expect(
        mockGetDraftDownloadState.mock.calls.length,
      ).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('downloading');
    });
  });

  it('keeps prior idle chip state when getDraftDownloadState rejects and retries on poll', async () => {
    jest.useFakeTimers();
    mockGetDraftDownloadState
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValue({
        chapterAssignmentId: 9,
        role: 'peer_check',
        status: 'ready',
        phase: 'idle',
        progress: 1,
        readyAtMs: 1,
      });

    try {
      const { result } = renderHook(() => useDraftDownload(request));

      await waitFor(() => {
        expect(mockGetDraftDownloadState).toHaveBeenCalled();
      });
      expect(result.current.state.status).toBe('idle');

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
      });
      expect(mockGetDraftDownloadState.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
