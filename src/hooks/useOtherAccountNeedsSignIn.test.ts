import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useOtherAccountNeedsSignIn } from './useOtherAccountNeedsSignIn';
import type { UploadSessionEvent } from '../services/syncEvents';

const mockAnyNeedsSignIn = jest.fn();
jest.mock('../services/accountSession', () => ({
  anyDeviceAccountNeedsSignIn: (...args: unknown[]) =>
    mockAnyNeedsSignIn(...args),
}));

let sessionListener: ((event: UploadSessionEvent) => void) | null = null;
jest.mock('../services/syncEvents', () => ({
  onUploadSessionEvent: (fn: (event: UploadSessionEvent) => void) => {
    sessionListener = fn;
    return () => {
      sessionListener = null;
    };
  },
}));

beforeEach(() => {
  mockAnyNeedsSignIn.mockReset().mockResolvedValue(false);
  sessionListener = null;
});

describe('useOtherAccountNeedsSignIn (#854)', () => {
  it('is false without checking when no other account has work', async () => {
    const { result } = renderHook(() => useOtherAccountNeedsSignIn([]));

    await act(async () => undefined);
    expect(result.current).toBe(false);
    expect(mockAnyNeedsSignIn).not.toHaveBeenCalled();
  });

  it('checks the accounts that have work', async () => {
    mockAnyNeedsSignIn.mockResolvedValue(true);

    const { result } = renderHook(() => useOtherAccountNeedsSignIn([20, 30]));

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockAnyNeedsSignIn).toHaveBeenCalledWith([20, 30]);
  });

  it("re-checks when an upload session ends, which is when another account's token is rejected", async () => {
    const { result } = renderHook(() => useOtherAccountNeedsSignIn([20]));
    await waitFor(() => expect(mockAnyNeedsSignIn).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(false);

    mockAnyNeedsSignIn.mockResolvedValue(true);
    act(() => {
      sessionListener?.({
        type: 'progress',
        completedChapters: 0,
        totalChapters: 1,
      });
    });
    expect(mockAnyNeedsSignIn).toHaveBeenCalledTimes(1);

    act(() => {
      sessionListener?.({ type: 'idle' });
    });

    await waitFor(() => expect(result.current).toBe(true));
    expect(mockAnyNeedsSignIn).toHaveBeenCalledTimes(2);
  });
});
