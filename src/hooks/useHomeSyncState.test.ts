import { useEffect } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
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
  isLinkOnline: true,
  hasPendingUploads: false,
  claimsPending: false,
};

jest.mock('./useConnectivity', () => ({
  useConnectivity: () => ({
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
}));

jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: () => Promise.resolve([]),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => 1,
}));

describe('useHomeSyncState', () => {
  beforeEach(() => {
    mockHomeFlags.reauthRequired = false;
    mockHomeFlags.isLinkOnline = true;
    mockHomeFlags.hasPendingUploads = false;
    mockHomeFlags.claimsPending = false;
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

  it('stays quiet while offline, and a Sync tap only counts during reauth', async () => {
    const hook = renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    hook.result.current.noteSyncOpened();

    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.isLinkOnline = false;
    hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);
    expect(hook.result.current.signInToSyncLabel).toBeNull();

    mockHomeFlags.isLinkOnline = true;
    hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);

    hook.result.current.noteSyncOpened();
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
  });
});
