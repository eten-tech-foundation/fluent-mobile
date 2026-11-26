import { act, renderHook } from '@testing-library/react-native';
import { emitSyncComplete, emitSyncStart } from '../services/syncEvents';
import { useGlobalSyncStatus } from './useGlobalSyncStatus';

describe('useGlobalSyncStatus', () => {
  afterEach(() => {
    emitSyncComplete();
  });

  it('reports syncing when mounted after a sync already started (#886)', async () => {
    emitSyncStart();

    const { result } = await renderHook(() => useGlobalSyncStatus());

    expect(result.current).toBe(true);

    await act(() => emitSyncComplete());

    expect(result.current).toBe(false);
  });

  it('reports idle when mounted with no sync running', async () => {
    emitSyncStart();
    emitSyncComplete();

    const { result } = await renderHook(() => useGlobalSyncStatus());

    expect(result.current).toBe(false);

    await act(() => emitSyncStart());

    expect(result.current).toBe(true);
  });
});
