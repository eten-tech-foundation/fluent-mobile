import { act, renderHook } from '@testing-library/react-native';
import { useMetadataSyncActive } from './useMetadataSyncActive';
import { emitSyncComplete, emitSyncStart } from '../services/syncEvents';

const mockIsMetadataSyncActive = jest.fn();
jest.mock('../services/sync', () => ({
  isMetadataSyncActive: () => mockIsMetadataSyncActive(),
}));

describe('useMetadataSyncActive (#886)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockIsMetadataSyncActive.mockReset();
    mockIsMetadataSyncActive.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('samples the in-flight state on mount, so a consumer mounted mid-sync sees it', () => {
    mockIsMetadataSyncActive.mockReturnValue(true);

    const { result } = renderHook(() => useMetadataSyncActive());

    expect(result.current).toBe(true);
  });

  it('flips on syncStart and off after syncComplete once the pass has settled', () => {
    const { result } = renderHook(() => useMetadataSyncActive());
    expect(result.current).toBe(false);

    mockIsMetadataSyncActive.mockReturnValue(true);
    act(() => {
      emitSyncStart();
    });
    expect(result.current).toBe(true);

    // A full sync emits syncComplete before its single-flight entry is
    // released: the synchronous sample still reads "active" …
    act(() => {
      emitSyncComplete();
    });
    expect(result.current).toBe(true);

    // … and the deferred sample reads the settled state.
    mockIsMetadataSyncActive.mockReturnValue(false);
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(result.current).toBe(false);
  });

  it('stops sampling after unmount', () => {
    const { unmount } = renderHook(() => useMetadataSyncActive());
    unmount();
    mockIsMetadataSyncActive.mockClear();

    act(() => {
      emitSyncStart();
      jest.runOnlyPendingTimers();
    });

    expect(mockIsMetadataSyncActive).not.toHaveBeenCalled();
  });
});
