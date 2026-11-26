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

let mockHoldReason: 'drafting' | null = null;
jest.mock('../services/uploadOrchestrator', () => ({
  getUploadSessionSnapshot: () => ({ holdReason: mockHoldReason }),
  setDraftingUploadHold: jest.fn(),
}));

const mockSessionListeners = new Set<() => void>();
jest.mock('../services/syncEvents', () => ({
  onUploadSessionEvent: (listener: () => void) => {
    mockSessionListeners.add(listener);
    return () => mockSessionListeners.delete(listener);
  },
}));

describe('useHeaderSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    mockHoldReason = null;
  });

  it('follows the drafting upload hold from session events', async () => {
    const { result, unmount } = await renderHook(() => useHeaderSync());
    expect(result.current.heldForDrafting).toBe(false);

    mockHoldReason = 'drafting';
    await act(() => mockSessionListeners.forEach(listener => listener()));
    expect(result.current.heldForDrafting).toBe(true);

    mockHoldReason = null;
    await act(() => mockSessionListeners.forEach(listener => listener()));
    expect(result.current.heldForDrafting).toBe(false);

    await unmount();
    expect(mockSessionListeners.size).toBe(0);
  });

  it('opens Sync once until the screen is focused again', async () => {
    const { result, rerender } = await renderHook(() => useHeaderSync());

    await act(() => result.current.openSync());
    await act(() => result.current.openSync());
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(hrefs.sync);

    mockFocused = false;
    await rerender({});
    mockFocused = true;
    await rerender({});
    await act(() => result.current.openSync());
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('goes through the guard, which can hold the push', async () => {
    const guard = jest.fn();
    const { result } = await renderHook(() => useHeaderSync({ guard }));

    await act(() => result.current.openSync());
    expect(guard).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    await act(() => guard.mock.calls[0][0]());
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('re-reads sync health after a sync finishes and when the screen returns', async () => {
    const { result, rerender } = await renderHook(() => useHeaderSync());
    expect(mockUseSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshKey: 0 }),
    );

    await act(() => onGlobalSyncComplete?.());
    expect(mockUseSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshKey: 1 }),
    );

    mockFocused = false;
    await rerender({});
    mockFocused = true;
    await rerender({});
    expect(mockUseSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ refreshKey: 2 }),
    );
    expect(result.current.refresh).toEqual(expect.any(Function));
  });
});
