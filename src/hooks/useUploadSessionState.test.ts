import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useUploadSessionState } from './useUploadSessionState';
import { emitUploadSessionEvent } from '../services/syncEvents';

const mockGetUploadSessionSnapshot = jest.fn();
const mockPauseUploadSession = jest.fn();
const mockCancelUploadSession = jest.fn();
const mockSyncNowUploads = jest.fn();

jest.mock('../services/uploadOrchestrator', () => ({
  getUploadSessionSnapshot: (...args: unknown[]) =>
    mockGetUploadSessionSnapshot(...args),
  pauseUploadSession: (...args: unknown[]) => mockPauseUploadSession(...args),
  cancelUploadSession: (...args: unknown[]) => mockCancelUploadSession(...args),
  syncNowUploads: (...args: unknown[]) => mockSyncNowUploads(...args),
}));

describe('useUploadSessionState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUploadSessionSnapshot.mockReturnValue({
      phase: 'idle',
      completedChapters: 0,
      totalChapters: 0,
      pausedUntilMs: null,
    });
    mockPauseUploadSession.mockResolvedValue(undefined);
    mockCancelUploadSession.mockResolvedValue(undefined);
    mockSyncNowUploads.mockResolvedValue(undefined);
  });

  it('derives pageStatus from snapshot and pending counts', async () => {
    mockGetUploadSessionSnapshot.mockReturnValue({
      phase: 'syncing',
      completedChapters: 1,
      totalChapters: 3,
      pausedUntilMs: null,
    });

    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: null,
      }),
    );

    await waitFor(() => {
      expect(result.current.pageStatus).toBe('syncing');
      expect(result.current.progressUploaded).toBe(1);
      expect(result.current.progressTotal).toBe(3);
    });
  });

  it('prefers live uploadProgress over snapshot counts', async () => {
    mockGetUploadSessionSnapshot.mockReturnValue({
      phase: 'syncing',
      completedChapters: 1,
      totalChapters: 5,
      pausedUntilMs: null,
    });

    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: { completed: 2, total: 5 },
      }),
    );

    await waitFor(() => {
      expect(result.current.progressUploaded).toBe(2);
      expect(result.current.progressTotal).toBe(5);
    });
  });

  it('exposes nextRetryAt from pausedUntilMs', async () => {
    const until = Date.now() + 60_000;
    mockGetUploadSessionSnapshot.mockReturnValue({
      phase: 'paused',
      completedChapters: 2,
      totalChapters: 4,
      pausedUntilMs: until,
    });

    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: null,
      }),
    );

    await waitFor(() => {
      expect(result.current.pageStatus).toBe('paused');
      expect(result.current.nextRetryAt?.getTime()).toBe(until);
    });
  });

  it('refreshes snapshot when upload session events fire', async () => {
    mockGetUploadSessionSnapshot
      .mockReturnValueOnce({
        phase: 'idle',
        completedChapters: 0,
        totalChapters: 0,
        pausedUntilMs: null,
      })
      .mockReturnValue({
        phase: 'syncing',
        completedChapters: 0,
        totalChapters: 2,
        pausedUntilMs: null,
      });

    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: null,
      }),
    );

    act(() => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 2 });
    });

    await waitFor(() => {
      expect(result.current.pageStatus).toBe('syncing');
      expect(result.current.progressTotal).toBe(2);
    });
  });

  it('pause calls pauseUploadSession', async () => {
    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: null,
      }),
    );

    await act(async () => {
      await result.current.pause();
    });

    expect(mockPauseUploadSession).toHaveBeenCalledTimes(1);
  });

  it('cancel calls cancelUploadSession', async () => {
    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: null,
      }),
    );

    await act(async () => {
      await result.current.cancel();
    });

    expect(mockCancelUploadSession).toHaveBeenCalledTimes(1);
  });

  it('resumeUploads calls syncNowUploads', async () => {
    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: null,
      }),
    );

    await act(async () => {
      await result.current.resumeUploads();
    });

    expect(mockSyncNowUploads).toHaveBeenCalledTimes(1);
  });

  it('sets sessionError when control action fails', async () => {
    mockPauseUploadSession.mockRejectedValue(new Error('orchestrator down'));

    const { result } = renderHook(() =>
      useUploadSessionState({
        hasPendingUploads: true,
        hasFailedUploads: false,
        uploadProgress: null,
      }),
    );

    await act(async () => {
      await result.current.pause();
    });

    expect(result.current.sessionError).toBe('orchestrator down');
    expect(result.current.isControlPending).toBe(false);
  });
});
