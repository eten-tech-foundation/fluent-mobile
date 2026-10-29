import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  emitSyncComplete,
  emitSyncStart,
  emitUploadSessionEvent,
} from '../../services/syncEvents';
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

jest.mock('../tabs/MyWorkTab', () => {
  const MockReact = require('react');
  const { Text } = require('react-native');
  return {
    MyWorkTab: ({ refreshKey }: { refreshKey?: number }) =>
      MockReact.createElement(
        MockReact.Fragment,
        null,
        MockReact.createElement(Text, { testID: 'my-work-tab' }, 'My Work'),
        MockReact.createElement(
          Text,
          { testID: 'my-work-refresh-key' },
          String(refreshKey),
        ),
      ),
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
    PageHeader: ({
      leftIcon,
      rightIcon,
    }: {
      leftIcon?: React.ReactNode;
      rightIcon?: React.ReactNode;
    }) =>
      MockReact.createElement(
        View,
        { testID: 'page-header' },
        leftIcon,
        rightIcon,
      ),
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

jest.mock('../../components/ui/PageHeaderSyncButton', () => {
  const MockReact = require('react');
  const { Pressable } = require('react-native');
  return {
    PageHeaderSyncButton: ({
      onPress,
      onPressIn,
    }: {
      onPress?: () => void;
      onPressIn?: () => void;
    }) =>
      MockReact.createElement(Pressable, {
        testID: 'home-sync-button',
        onPress,
        onPressIn,
      }),
  };
});

jest.mock('../../components/ui/ReauthBanner', () => ({
  ReauthBanner: () => null,
}));

import { HomeScreenBody } from './HomeScreen';

describe('HomeScreenBody progressive login (#670)', () => {
  beforeEach(() => {
    delete mockLocalSearchParams.newUserLoading;
    mockPush.mockClear();
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

  it('bumps My Work refreshKey when the upload session completes (#257)', async () => {
    render(<HomeScreenBody postLoginSyncActive={false} userSwitchEpoch={0} />);
    const readKey = () =>
      Number(screen.getByTestId('my-work-refresh-key').props.children);
    const before = readKey();

    // Progress / pause events must not reload My Work.
    await act(async () => {
      emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
      emitUploadSessionEvent({
        type: 'progress',
        completedChapters: 0,
        totalChapters: 1,
      });
    });
    expect(readKey()).toBe(before);

    await act(async () => {
      emitUploadSessionEvent({ type: 'complete' });
    });
    expect(readKey()).toBe(before + 1);
  });

  it('unsubscribes from upload session events on unmount (#257)', () => {
    const syncEvents = require('../../services/syncEvents');
    const unsubscribe = jest.fn();
    const spy = jest
      .spyOn(syncEvents, 'onUploadSessionEvent')
      .mockReturnValue(unsubscribe);

    const { unmount } = render(
      <HomeScreenBody postLoginSyncActive={false} userSwitchEpoch={0} />,
    );
    expect(spy).toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });
});

describe('HomeScreenBody Sync navigation (#721)', () => {
  beforeEach(() => {
    delete mockLocalSearchParams.newUserLoading;
    mockPush.mockClear();
  });

  it('keeps the Sync button mounted while settling and navigates on tap', () => {
    render(<HomeScreenBody postLoginSyncActive userSwitchEpoch={0} />);

    expect(screen.getByTestId('home-loading')).toBeTruthy();
    const syncButton = screen.getByTestId('home-sync-button');
    expect(syncButton).toBeTruthy();

    fireEvent(syncButton, 'pressIn');
    fireEvent.press(syncButton);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(hrefs.sync);
  });

  it('ignores a duplicate Sync press while navigation is in flight', () => {
    render(<HomeScreenBody postLoginSyncActive userSwitchEpoch={0} />);

    const syncButton = screen.getByTestId('home-sync-button');
    fireEvent.press(syncButton);
    fireEvent.press(syncButton);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(hrefs.sync);
  });
});
