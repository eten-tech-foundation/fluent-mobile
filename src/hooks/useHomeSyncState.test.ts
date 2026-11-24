import { useEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useHomeSyncState } from './useHomeSyncState';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
}));

jest.mock('./usePreferences', () => ({
  usePreferences: () => ({ uploadOverCellular: false }),
}));

const mockHomeFlags = {
  reauthRequired: false,
  hasResolved: true,
  isOnline: true,
  isLinkOnline: true,
  hasPendingUploads: false,
  claimsPending: false,
  advancesPending: false,
};

jest.mock('./useConnectivity', () => ({
  useConnectivity: () => ({
    isOnline: mockHomeFlags.isOnline,
    hasResolved: mockHomeFlags.hasResolved,
    isLinkOnline: mockHomeFlags.isLinkOnline,
    isWifi: true,
    connectionType: 'wifi',
    hasTransferResolved: true,
  }),
}));

jest.mock('./useSync', () => ({
  useSync: () => ({ isSyncing: false, triggerSync: jest.fn() }),
}));

jest.mock('./useSyncStatus', () => ({
  useSyncStatus: () => ({
    status: 'online_synced',
    needsDownloadSync: false,
    isOnline: true,
    failedErrorText: null,
    hasPendingUploads: mockHomeFlags.hasPendingUploads,
  }),
}));

jest.mock('./useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => false,
}));

jest.mock('./useReauthRequired', () => {
  const refreshReauthRequired = jest.fn();
  return {
    useReauthRequired: () => ({
      reauthRequired: mockHomeFlags.reauthRequired,
      refreshReauthRequired,
    }),
  };
});

jest.mock('../services/launchRecoveryGate', () => ({
  launchRecoveryGate: {
    isSettled: () => true,
    whenSettled: () => Promise.resolve(),
  },
}));

jest.mock('../services/syncEvents', () => ({
  onSyncComplete: () => () => {},
  onSyncStart: () => () => {},
  onUploadSessionEvent: () => () => {},
}));

jest.mock('../services/storage', () => ({
  getPrepareOfflineDownloadStarted: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getProjectsWithSummary: jest.fn(),
  isUserAssignedToProject: jest.fn(),
  hasPendingChapterClaimsForUser: () =>
    Promise.resolve(mockHomeFlags.claimsPending),
  hasPendingStageAdvancesForUser: () =>
    Promise.resolve(mockHomeFlags.advancesPending),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => 1,
}));

describe('useHomeSyncState', () => {
  beforeEach(() => {
    mockHomeFlags.reauthRequired = false;
    mockHomeFlags.hasResolved = true;
    mockHomeFlags.isOnline = true;
    mockHomeFlags.isLinkOnline = true;
    mockHomeFlags.hasPendingUploads = false;
    mockHomeFlags.claimsPending = false;
    mockHomeFlags.advancesPending = false;
  });

  it('bumps the re-read in the render where the post-login sync ends', () => {
    const commits: { active: boolean; refreshKey: number }[] = [];
    const hook = renderHook(
      ({ active }: { active: boolean }) => {
        const state = useHomeSyncState({
          postLoginSyncActive: active,
          userSwitchEpoch: 0,
        });
        const { refreshKey } = state;
        useEffect(() => {
          commits.push({ active, refreshKey });
        }, [active, refreshKey]);
        return state;
      },
      { initialProps: { active: true } },
    );
    const before = hook.result.current.refreshKey;

    hook.rerender({ active: false });

    expect(hook.result.current.refreshKey).toBe(before + 1);
    expect(hook.result.current.showLoading).toBe(false);
    // No commit shows the ended sync with the old key, which would let Home
    // paint the pre-sync (empty) lists for a frame.
    expect(commits.filter(c => !c.active && c.refreshKey === before)).toEqual(
      [],
    );
  });

  it('shows the session banner when online and a claim is waiting', async () => {
    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.claimsPending = true;
    const hook = renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
    expect(hook.result.current.signInToSyncLabel).toBe('Sign in to sync');
  });

  it('shows the session banner when online and a stage advance is waiting', async () => {
    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.advancesPending = true;
    const hook = renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
  });

  it('stays quiet while offline, and a Sync tap only counts during reauth', async () => {
    const hook = renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    hook.result.current.noteSyncOpened();

    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.isOnline = false;
    mockHomeFlags.isLinkOnline = false;
    hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);
    expect(hook.result.current.signInToSyncLabel).toBeNull();

    mockHomeFlags.isOnline = true;
    mockHomeFlags.isLinkOnline = true;
    hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);

    hook.result.current.noteSyncOpened();
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
  });

  it.each([
    ['Fluent is unreachable', { hasResolved: true, isOnline: false }],
    [
      'the first /health answer is pending',
      { hasResolved: false, isOnline: true },
    ],
  ])('stays quiet on a connected link while %s', async (_case, reach) => {
    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.claimsPending = true;
    mockHomeFlags.hasResolved = reach.hasResolved;
    mockHomeFlags.isOnline = reach.isOnline;
    mockHomeFlags.isLinkOnline = true;
    const hook = renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    hook.result.current.noteSyncOpened();
    // Let the queued-claims read settle so only reachability can hide it.
    await act(async () => {
      await Promise.resolve();
    });
    hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);
    expect(hook.result.current.signInToSyncLabel).toBeNull();

    mockHomeFlags.hasResolved = true;
    mockHomeFlags.isOnline = true;
    hook.rerender(undefined);
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
    expect(hook.result.current.signInToSyncLabel).toBe('Sign in to sync');
  });
});
