import { act, renderHook } from '@testing-library/react-native';
import { hrefs } from '../navigation/hrefs';
import { useHeaderSync } from './useHeaderSync';

const mockPush = jest.fn();
let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useIsFocused: () => mockFocused,
}));

let onGlobalSyncComplete: (() => void) | undefined;
jest.mock('./useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: (onComplete?: () => void) => {
    onGlobalSyncComplete = onComplete;
    return false;
  },
}));

const mockUseSyncStatus = jest.fn((_opts?: { refreshKey?: number }) => ({
  status: 'online_synced' as const,
  failedErrorText: null as string | null,
}));
jest.mock('./useSyncStatus', () => ({
  useSyncStatus: (opts: { refreshKey?: number }) => mockUseSyncStatus(opts),
}));

describe('useHeaderSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
  });

  it('opens Sync once until the screen is focused again', () => {
    const { result, rerender } = renderHook(() => useHeaderSync());

    act(() => result.current.openSync());
    act(() => result.current.openSync());
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(hrefs.sync);

    mockFocused = false;
    rerender({});
    mockFocused = true;
    rerender({});
    act(() => result.current.openSync());
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('goes through the guard, which can hold the push', () => {
    const guard = jest.fn();
    const { result } = renderHook(() => useHeaderSync({ guard }));

    act(() => result.current.openSync());
    expect(guard).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    act(() => guard.mock.calls[0][0]());
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('re-reads sync health after a sync finishes and when the screen returns', () => {
    const { result, rerender } = renderHook(() => useHeaderSync());
    expect(mockUseSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshKey: 0 }),
    );

    act(() => onGlobalSyncComplete?.());
    expect(mockUseSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshKey: 1 }),
    );

    mockFocused = false;
    rerender({});
    mockFocused = true;
    rerender({});
    expect(mockUseSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshKey: 2 }),
    );
    expect(result.current.refresh).toEqual(expect.any(Function));
  });
});
