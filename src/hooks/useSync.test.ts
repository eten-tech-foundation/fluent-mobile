const mockSyncAllUsers = jest.fn();
const mockGetSyncState = jest.fn();
const mockGetSyncError = jest.fn();

jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

jest.mock('../services/sync', () => ({
  syncAllUsers: () => mockSyncAllUsers(),
}));

jest.mock('../services/storage', () => ({
  ...jest.requireActual('../services/storage'),
  getSyncState: () => mockGetSyncState(),
  getSyncError: (key: string) => mockGetSyncError(key),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { KV_KEYS } from '../services/storage';
import { useSync } from './useSync';

describe('useSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSyncAllUsers.mockReset();
    mockGetSyncState.mockReset();
    mockGetSyncError.mockReset();

    mockGetSyncState.mockReturnValue({
      lastSyncedAt: '',
      projectsCount: 0,
      chaptersCount: 0,
      biblesCount: 0,
    });
    mockGetSyncError.mockReturnValue(undefined);
    mockSyncAllUsers.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows never-synced state when no timestamp is stored', () => {
    const { result } = renderHook(() => useSync());

    expect(result.current.stateType).toBe('never');
    expect(result.current.displayText).toBe('Never synced');
    expect(result.current.isSyncing).toBe(false);
  });

  it('shows the first stored sync error step', () => {
    mockGetSyncError.mockImplementation((key: string) =>
      key === KV_KEYS.SYNC_ERROR_PROJECTS ? 'network down' : undefined,
    );

    const { result } = renderHook(() => useSync());

    expect(result.current.stateType).toBe('error');
    expect(result.current.displayText).toBe('Sync failed: projects');
  });

  it('shows last synced relative time in normal state', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    mockGetSyncState.mockReturnValue({
      lastSyncedAt: fiveMinutesAgo,
      projectsCount: 1,
      chaptersCount: 2,
      biblesCount: 3,
    });

    const { result } = renderHook(() => useSync());

    expect(result.current.stateType).toBe('normal');
    expect(result.current.displayText).toBe('Last synced: 5 mins ago');
  });

  it('runs sync callbacks and toggles syncing state', async () => {
    const onSyncStart = jest.fn();
    const onSyncComplete = jest.fn();
    const onError = jest.fn();
    let resolveSync: (() => void) | undefined;
    mockSyncAllUsers.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveSync = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useSync({ onSyncStart, onSyncComplete, onError }),
    );

    let syncPromise: Promise<void> | undefined;
    act(() => {
      syncPromise = result.current.triggerSync();
    });

    expect(onSyncStart).toHaveBeenCalled();
    expect(result.current.isSyncing).toBe(true);
    expect(result.current.stateType).toBe('syncing');
    expect(result.current.displayText).toBe('Syncing...');

    await act(async () => {
      resolveSync?.();
      await syncPromise;
    });

    await waitFor(() => {
      expect(result.current.isSyncing).toBe(false);
    });

    expect(onSyncComplete).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('invokes onError when syncAllUsers rejects', async () => {
    const onError = jest.fn();
    mockSyncAllUsers.mockRejectedValue(new Error('sync failed'));

    const { result } = renderHook(() => useSync({ onError }));

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(result.current.isSyncing).toBe(false);
  });

  it('refreshes relative time on the normal-state interval', () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    mockGetSyncState.mockReturnValue({
      lastSyncedAt: twoMinutesAgo,
      projectsCount: 1,
      chaptersCount: 1,
      biblesCount: 1,
    });

    const { result } = renderHook(() => useSync());

    expect(result.current.displayText).toBe('Last synced: 2 mins ago');

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(result.current.displayText).toBe('Last synced: 3 mins ago');
  });
});
