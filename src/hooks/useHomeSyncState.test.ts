import { renderHook } from '@testing-library/react-native';
import { useHomeSyncState } from './useHomeSyncState';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
}));

jest.mock('./usePreferences', () => ({
  usePreferences: () => ({ uploadOverCellular: false }),
}));

jest.mock('./useConnectivity', () => ({
  useConnectivity: () => ({
    isLinkOnline: true,
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
  }),
}));

jest.mock('./useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => false,
}));

jest.mock('./useReauthRequired', () => {
  const refreshReauthRequired = jest.fn();
  return {
    useReauthRequired: () => ({
      reauthRequired: false,
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
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => 1,
}));

describe('useHomeSyncState', () => {
  it('bumps the re-read in the render where the post-login sync ends', () => {
    const hook = renderHook(
      ({ active }: { active: boolean }) =>
        useHomeSyncState({ postLoginSyncActive: active, userSwitchEpoch: 0 }),
      { initialProps: { active: true } },
    );
    const before = hook.result.current.refreshKey;

    hook.rerender({ active: false });

    expect(hook.result.current.refreshKey).toBe(before + 1);
    expect(hook.result.current.showLoading).toBe(false);
  });
});
