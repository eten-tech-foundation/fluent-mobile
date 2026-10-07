import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SettingsScreen from './SettingsScreen';

const mockSignOut = jest.fn();
const mockNotifyUserSwitched = jest.fn();
const mockSignOutCurrentDeviceAccount = jest.fn();
const mockGetUnsyncedRecordingCount = jest.fn();

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
  const React = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    SettingsNavigationRow: ({
      title,
      onPress,
      testID,
    }: {
      title: string;
      onPress: () => void;
      testID?: string;
    }) => (
      <TouchableOpacity testID={testID} onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
    SettingsDestructiveRow: ({
      title,
      onPress,
      testID,
    }: {
      title: string;
      onPress: () => void;
      testID?: string;
    }) => (
      <TouchableOpacity testID={testID} onPress={onPress}>
        <Text>{title}</Text>
      </TouchableOpacity>
    ),
    SettingsToggleRow: () => <View />,
    SettingsSegmentedRow: () => <View />,
  };
});

jest.mock('../../components/layout/StackScreenHeader', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { StackScreenHeader: () => <View /> };
});

jest.mock('../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    signOut: (...args: unknown[]) => mockSignOut(...args),
    notifyUserSwitched: (...args: unknown[]) =>
      mockNotifyUserSwitched(...args),
  }),
}));

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({
    uploadOverCellular: false,
    setUploadOverCellular: jest.fn(),
    uiVersion: 'legacy',
    setUiVersion: jest.fn(),
  }),
}));

jest.mock('../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => ({
    draftingUnit: 'verse',
    setDraftingUnit: jest.fn(),
  }),
}));

jest.mock('../../hooks/useReauthRequired', () => ({
  useReauthRequired: () => ({ reauthRequired: false }),
}));

jest.mock('../../services/storage', () => ({
  getKnownUserIds: () => [],
  MAX_DEVICE_ACCOUNTS: 3,
}));

jest.mock('../../services/accountSession', () => ({
  signOutCurrentDeviceAccount: (...args: unknown[]) =>
    mockSignOutCurrentDeviceAccount(...args),
}));

jest.mock('../../services/pausedTakes', () => ({
  clearAllPausedTakes: jest.fn(),
}));

jest.mock('../../db/queries', () => ({
  getUnsyncedRecordingCount: (...args: unknown[]) =>
    mockGetUnsyncedRecordingCount(...args),
}));

jest.mock('../../navigation/resetNavigationAfterAccountSwitch', () => ({
  resetNavigationAfterAccountSwitch: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { create: () => ({ info: jest.fn(), error: jest.fn() }) },
}));

describe('SettingsScreen log out', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetUnsyncedRecordingCount.mockResolvedValue(0);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('shows the unsynced warning and does not log out until confirmed', async () => {
    mockGetUnsyncedRecordingCount.mockResolvedValue(1);
    mockSignOutCurrentDeviceAccount.mockResolvedValue({ kind: 'signed_out' });
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('settings-log-out'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Unsynced work on device',
        'You have recordings that have not been uploaded. Log out anyway?',
        expect.any(Array),
      );
    });
    expect(mockSignOutCurrentDeviceAccount).not.toHaveBeenCalled();

    const buttons = (
      jest.mocked(Alert.alert).mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>
    );
    buttons.find(button => button.text === 'Log out')?.onPress?.();

    await waitFor(() => {
      expect(mockSignOutCurrentDeviceAccount).toHaveBeenCalled();
    });
  });
});
