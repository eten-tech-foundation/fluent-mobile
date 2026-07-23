import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRetryFailedUploads } from './useRetryFailedUploads';
import { authToken } from '../services/authToken';

jest.mock('../services/recordingSync', () => ({
  syncPendingRecordings: jest.fn(),
}));

import { syncPendingRecordings } from '../services/recordingSync';

const mockSyncPendingRecordings = syncPendingRecordings as jest.MockedFunction<
  typeof syncPendingRecordings
>;

describe('useRetryFailedUploads', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    authToken.set(null);
  });

  afterEach(() => {
    authToken.set(null);
  });

  it('fails fast when there is no auth token', async () => {
    const { result } = renderHook(() => useRetryFailedUploads());

    let outcome: Awaited<ReturnType<typeof result.current.retryFailedUploads>> =
      null;
    await act(async () => {
      outcome = await result.current.retryFailedUploads();
    });

    expect(outcome).toBeNull();
    expect(result.current.lastError).toMatch(/Not signed in/);
    expect(mockSyncPendingRecordings).not.toHaveBeenCalled();
    expect(result.current.isRetrying).toBe(false);
  });

  it('calls syncPendingRecordings and reflects in-flight + result', async () => {
    authToken.set('tok-1');
    let resolveUpload!: (value: { uploaded: number; failed: number }) => void;
    mockSyncPendingRecordings.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUpload = resolve;
        }),
    );

    const { result } = renderHook(() => useRetryFailedUploads());

    let pending: Promise<{ uploaded: number; failed: number } | null>;
    act(() => {
      pending = result.current.retryFailedUploads();
    });

    await waitFor(() => {
      expect(result.current.isRetrying).toBe(true);
    });

    await act(async () => {
      resolveUpload({ uploaded: 2, failed: 0 });
      await pending!;
    });

    expect(mockSyncPendingRecordings).toHaveBeenCalledWith('tok-1');
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.lastResult).toEqual({ uploaded: 2, failed: 0 });
    expect(result.current.lastError).toBeNull();
  });
});
