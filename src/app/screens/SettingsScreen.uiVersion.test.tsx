import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SettingsScreen from './SettingsScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../components/layout/ScreenContainer', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ScreenContainer: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

jest.mock('../../components/ui/SettingsListRow', () => {
  const { Text, View } = require('react-native');
  const row = (title: string, testID?: string) => (
    <View testID={testID}>
      <Text>{title}</Text>
    </View>
  );
  return {
    SettingsNavigationRow: ({
      title,
      testID,
    }: {
      title: string;
      testID?: string;
    }) => row(title, testID),
    SettingsDestructiveRow: ({
      title,
      testID,
    }: {
      title: string;
      testID?: string;
    }) => row(title, testID),
    SettingsToggleRow: ({
      title,
      testID,
    }: {
      title: string;
      testID?: string;
    }) => row(title, testID),
    SettingsSegmentedRow: ({
      title,
      testID,
    }: {
      title: string;
      testID?: string;
    }) => row(title, testID),
  };
});

jest.mock('../../components/layout/StackScreenHeader', () => {
  const { View } = require('react-native');
  return { StackScreenHeader: () => <View /> };
});

jest.mock('../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    signOut: jest.fn(),
    notifyUserSwitched: jest.fn(),
  }),
}));

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({
    uploadOverCellular: false,
    setUploadOverCellular: jest.fn(),
  }),
}));

jest.mock('../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => ({
    draftingUnit: 'verse',
    setDraftingUnit: jest.fn(),
  }),
}));

const mockReauthRequired = jest.fn(() => false);

jest.mock('../../hooks/useReauthRequired', () => ({
  useReauthRequired: () => ({ reauthRequired: mockReauthRequired() }),
}));

jest.mock('../../services/storage', () => ({
  getKnownUserIds: () => [],
  MAX_DEVICE_ACCOUNTS: 3,
}));

jest.mock('../../services/accountSession', () => ({
  signOutCurrentDeviceAccount: jest.fn(),
}));

jest.mock('../../services/pausedTakes', () => ({
  clearAllPausedTakes: jest.fn(),
}));

jest.mock('../../db/queries', () => ({
  getUnsyncedRecordingCount: jest.fn(),
}));

jest.mock('../../navigation/resetNavigationAfterAccountSwitch', () => ({
  resetNavigationAfterAccountSwitch: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { create: () => ({ info: jest.fn(), error: jest.fn() }) },
}));

const mockGalleryEnabled = jest.fn(() => false);

jest.mock('../../config/componentGallery', () => ({
  isComponentGalleryEnabled: () => mockGalleryEnabled(),
}));

describe('SettingsScreen UI version', () => {
  afterEach(() => {
    mockGalleryEnabled.mockReturnValue(false);
    mockReauthRequired.mockReturnValue(false);
  });

  it('offers no UI version choice and keeps the other controls', async () => {
    mockGalleryEnabled.mockReturnValue(true);
    mockReauthRequired.mockReturnValue(true);

    await render(<SettingsScreen />);

    expect(screen.queryByText('UI version')).toBeNull();
    expect(screen.queryByTestId('settings-ui-version')).toBeNull();
    expect(screen.getByTestId('settings-component-gallery')).toBeTruthy();
    expect(screen.getByTestId('settings-upload-cellular')).toBeTruthy();
    expect(screen.getByTestId('settings-drafting-unit')).toBeTruthy();
    expect(screen.getByTestId('settings-reauth')).toBeTruthy();
    expect(screen.getByTestId('settings-add-user')).toBeTruthy();
    expect(screen.getByTestId('settings-log-out')).toBeTruthy();
  });
});
