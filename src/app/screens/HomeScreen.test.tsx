import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { emitSyncComplete, emitSyncStart } from '../../services/syncEvents';

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    postLoginSyncActive: false,
    userSwitchEpoch: 0,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ openDrawer: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({ uploadOverCellular: false }),
}));

jest.mock('../../hooks/useConnectivity', () => ({
  useConnectivity: () => ({
    isLinkOnline: true,
    isWifi: true,
    connectionType: 'wifi',
    hasTransferResolved: true,
  }),
}));

jest.mock('../../hooks/useSync', () => ({
  useSync: () => ({
    isSyncing: false,
    triggerSync: jest.fn(),
    needsDownloadSync: false,
    syncIsOnline: true,
  }),
}));

jest.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({
    syncStatus: 'idle',
    failedErrorText: undefined,
  }),
}));

jest.mock('../../hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ isSyncing: false }),
}));

const mockRefreshReauthRequired = jest.fn();
jest.mock('../../hooks/useReauthRequired', () => ({
  useReauthRequired: () => ({
    reauthRequired: false,
    refreshReauthRequired: mockRefreshReauthRequired,
  }),
}));

jest.mock('../../db/queries', () => ({
  getProjectsWithSummary: jest.fn().mockResolvedValue([]),
  isUserAssignedToProject: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../services/storage', () => ({
  getPrepareOfflineDownloadStarted: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/prepareOfflineAutoPrompt', () => ({
  createPrepareOfflineAutoPromptController: () => ({
    notifySettlingChanged: jest.fn(),
    request: jest.fn(),
    resetShownThisAppOpen: jest.fn(),
  }),
}));

jest.mock('../tabs/MyWorkTab', () => {
  const MockReact = require('react');
  const { Text } = require('react-native');
  return {
    MyWorkTab: () =>
      MockReact.createElement(Text, { testID: 'my-work-tab' }, 'My Work'),
  };
});

jest.mock('../tabs/ProjectsTab', () => {
  const MockReact = require('react');
  const { Text } = require('react-native');
  return {
    ProjectsTab: () =>
      MockReact.createElement(Text, { testID: 'projects-tab' }, 'Projects'),
  };
});

jest.mock('../../components/layout/ScreenContainer', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    ScreenContainer: ({ children }: { children?: unknown }) =>
      MockReact.createElement(View, { testID: 'screen-container' }, children),
  };
});

jest.mock('../../components/layout/PageHeader', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    PageHeader: () => MockReact.createElement(View, { testID: 'page-header' }),
  };
});

jest.mock('../../components/layout/TabBar', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return {
    TabBar: () => MockReact.createElement(View, { testID: 'tab-bar' }),
    HomeTab: {},
  };
});

jest.mock('../../components/ui/SettingsButton', () => ({
  SettingsButton: () => null,
}));

jest.mock('../../components/ui/PageHeaderSyncButton', () => ({
  PageHeaderSyncButton: () => null,
}));

jest.mock('../../components/ui/ReauthBanner', () => ({
  ReauthBanner: () => null,
}));

import { HomeScreenBody } from './HomeScreen';

describe('HomeScreenBody progressive login (#670)', () => {
  it('dismisses full-screen loading when Tier 1 clears while sync continues', async () => {
    const { rerender } = render(
      <HomeScreenBody postLoginSyncActive userSwitchEpoch={0} />,
    );

    await act(async () => {
      emitSyncStart();
    });

    expect(screen.getByTestId('home-loading')).toBeTruthy();

    rerender(
      <HomeScreenBody postLoginSyncActive={false} userSwitchEpoch={0} />,
    );

    expect(screen.queryByTestId('home-loading')).toBeNull();
    expect(screen.getByTestId('my-work-tab')).toBeTruthy();

    await act(async () => {
      emitSyncComplete();
    });
  });
});
