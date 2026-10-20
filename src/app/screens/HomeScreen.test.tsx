import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { emitSyncComplete, emitSyncStart } from '../../services/syncEvents';
import { hrefs } from '../../navigation/hrefs';

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    postLoginSyncActive: false,
    userSwitchEpoch: 0,
  }),
}));

const mockLocalSearchParams: { newUserLoading?: string } = {};
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ openDrawer: jest.fn() }),
  useLocalSearchParams: () => mockLocalSearchParams,
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

let mockMyWorkBody: 'tab' | 'empty' | 'populated' = 'tab';

jest.mock('../tabs/MyWorkTab', () => {
  const MockReact = require('react');
  const { Text } = require('react-native');
  return {
    MyWorkTab: () => {
      if (mockMyWorkBody === 'empty') {
        return MockReact.createElement(
          Text,
          { testID: 'my-work-empty' },
          'empty',
        );
      }
      if (mockMyWorkBody === 'populated') {
        return MockReact.createElement(
          Text,
          { testID: 'my-work-row-1' },
          'row',
        );
      }
      return MockReact.createElement(
        Text,
        { testID: 'my-work-tab' },
        'My Work',
      );
    },
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
    PageHeader: ({ rightIcon }: { rightIcon?: React.ReactNode }) =>
      MockReact.createElement(View, { testID: 'page-header' }, rightIcon),
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

jest.mock('../../components/ui/CloudSyncStatusIcon', () => ({
  CloudSyncStatusIcon: () => null,
}));

const mockPageHeaderSyncButton = jest.fn(
  (_props?: object): React.ReactNode => null,
);

jest.mock('../../components/ui/PageHeaderSyncButton', () => ({
  PageHeaderSyncButton: (props: object) => mockPageHeaderSyncButton(props),
}));

jest.mock('../../components/ui/ReauthBanner', () => ({
  ReauthBanner: () => null,
}));

import { HomeScreenBody } from './HomeScreen';

describe('HomeScreenBody progressive login (#670)', () => {
  beforeEach(() => {
    delete mockLocalSearchParams.newUserLoading;
    mockMyWorkBody = 'tab';
    mockPush.mockClear();
    mockPageHeaderSyncButton.mockReset();
    mockPageHeaderSyncButton.mockImplementation(() => null);
  });

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

  it('clears route newUserLoading when Tier 1 ends so the loader does not wait for Tier 2', async () => {
    mockLocalSearchParams.newUserLoading = 'true';
    const { rerender, unmount } = render(
      <HomeScreenBody postLoginSyncActive userSwitchEpoch={0} />,
    );

    expect(screen.getByTestId('home-loading')).toBeTruthy();

    await act(async () => {
      emitSyncStart();
    });

    rerender(
      <HomeScreenBody postLoginSyncActive={false} userSwitchEpoch={0} />,
    );

    expect(screen.queryByTestId('home-loading')).toBeNull();
    expect(screen.getByTestId('my-work-tab')).toBeTruthy();

    unmount();
  });
});

describe('HomeScreenBody sync header', () => {
  beforeEach(() => {
    delete mockLocalSearchParams.newUserLoading;
    mockMyWorkBody = 'tab';
    mockPush.mockClear();
    mockPageHeaderSyncButton.mockReset();
    mockPageHeaderSyncButton.mockImplementation(() => null);
  });

  it('pushes the sync route from the real header button when My Work is empty and when it has a row', () => {
    const actual = jest.requireActual(
      '../../components/ui/PageHeaderSyncButton',
    ) as typeof import('../../components/ui/PageHeaderSyncButton');
    mockPageHeaderSyncButton.mockImplementation(props =>
      React.createElement(
        actual.PageHeaderSyncButton,
        props as React.ComponentProps<typeof actual.PageHeaderSyncButton>,
      ),
    );

    mockMyWorkBody = 'empty';
    const empty = render(
      <HomeScreenBody postLoginSyncActive={false} userSwitchEpoch={0} />,
    );
    expect(screen.getByTestId('my-work-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-sync-button'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(hrefs.sync);
    empty.unmount();

    mockPush.mockClear();
    mockMyWorkBody = 'populated';
    const populated = render(
      <HomeScreenBody postLoginSyncActive={false} userSwitchEpoch={0} />,
    );
    expect(screen.getByTestId('my-work-row-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-sync-button'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(hrefs.sync);
    populated.unmount();
  });
});
