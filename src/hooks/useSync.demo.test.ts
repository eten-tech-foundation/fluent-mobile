import { renderHook, act } from '@testing-library/react-native';
import { useSync } from './useSync';
import { syncAllUsers } from '../services/sync';

jest.mock('../config/demoMode', () => ({
  IS_DEMO_MODE: true,
}));

jest.mock('../services/sync', () => ({
  syncAllUsers: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/storage', () => ({
  getSyncState: jest.fn(() => ({ lastSyncedAt: '2026-01-01T00:00:00.000Z' })),
  getSyncError: jest.fn(() => undefined),
  KV_KEYS: {},
}));

describe('useSync in demo mode', () => {
  it('does not call syncAllUsers when triggerSync runs', async () => {
    const { result } = renderHook(() => useSync());

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(syncAllUsers).not.toHaveBeenCalled();
  });
});
