import { act, renderHook } from '@testing-library/react-native';
import { emitSyncComplete, emitSyncStart } from '../services/syncEvents';
import { useGlobalSyncStatus } from './useGlobalSyncStatus';

describe('useGlobalSyncStatus', () => {
  afterEach(() => {
    emitSyncComplete();
  });

  it('reports syncing when mounted after a sync already started (#886)', () => {
    emitSyncStart();

    const { result } = renderHook(() => useGlobalSyncStatus());

    expect(result.current).toBe(true);

    act(() => emitSyncComplete());

    expect(result.current).toBe(false);
  });

  it('reports idle when mounted with no sync running', () => {
    emitSyncStart();
    emitSyncComplete();

    const { result } = renderHook(() => useGlobalSyncStatus());

    expect(result.current).toBe(false);

    act(() => emitSyncStart());

    expect(result.current).toBe(true);
  });
});
