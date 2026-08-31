import React from 'react';
import { Alert } from 'react-native';
import { UserSettingsMenu } from './UserSettingsMenu';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { hrefs } from '../../navigation/hrefs';
import type { DrawerContentComponentProps } from 'expo-router/drawer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockCanDismiss = jest.fn(() => false);
const mockNavigate = jest.fn();
const mockCloseDrawer = jest.fn();
let mockDrawerStatus: 'open' | 'closed' = 'closed';
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canDismiss: mockCanDismiss,
    dismissAll: mockDismissAll,
  }),
}));
jest.mock('expo-router/drawer', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    useDrawerStatus: () => mockDrawerStatus,
    DrawerContentScrollView: ({
      children,
      testID,
    }: {
      children: React.ReactNode;
      testID?: string;
    }) => <View testID={testID}>{children}</View>,
    DrawerItem: ({
      label,
      onPress,
      testID,
      accessibilityLabel,
      icon,
      focused,
      activeTintColor,
      activeBackgroundColor,
    }: {
      label: string;
      onPress: () => void;
      testID?: string;
      accessibilityLabel?: string;
      focused?: boolean;
      activeTintColor?: string;
      activeBackgroundColor?: string;
      icon?: (props: {
        color: string;
        size: number;
        focused: boolean;
      }) => React.ReactNode;
    }) => (
      <Pressable
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected: !!focused }}
        // Surface focused styling props for assertions (RN Pressable ignores unknowns).
        {...{
          activeTintColor,
          activeBackgroundColor:
            activeBackgroundColor === undefined
              ? 'DEFAULT_ALPHA_PRIMARY'
              : activeBackgroundColor,
        }}
        onPress={onPress}
      >
        {icon?.({
          color: focused ? '#1a6ef5' : '#333',
          size: 18,
          focused: !!focused,
        })}
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

const mockGetActiveUserId = jest.fn();
jest.mock('../../services/storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  getKnownUserIds: jest.fn(),
  MAX_DEVICE_ACCOUNTS: 3,
}));

const mockSwitchToDeviceAccount = jest.fn();
const mockSignOutCurrentDeviceAccount = jest.fn();
jest.mock('../../services/accountSession', () => ({
  switchToDeviceAccount: (...args: unknown[]) =>
    mockSwitchToDeviceAccount(...args),
  signOutCurrentDeviceAccount: (...args: unknown[]) =>
    mockSignOutCurrentDeviceAccount(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: { create: () => ({ info: jest.fn(), error: jest.fn() }) },
}));

const mockUseDeviceAccounts = jest.fn();
jest.mock('../../hooks/useDeviceAccounts', () => ({
  useDeviceAccounts: (...args: unknown[]) => mockUseDeviceAccounts(...args),
}));

const activeAccount = {
  userId: 'active-1',
  displayName: 'Active User',
  email: 'active@example.com',
  initials: 'AU',
  isActive: true,
};

const otherAccount = {
  userId: 'other-2',
  displayName: 'Other User',
  email: 'other@example.com',
  initials: 'OU',
  isActive: false,
};

const mockReload = jest.fn();

function setDeviceAccountsResult(
  overrides: Partial<{
    accounts: (typeof activeAccount)[];
    hasAccountLimit: boolean;
    loading: boolean;
  }> = {},
) {
  const accounts = overrides.accounts ?? [activeAccount, otherAccount];
  mockUseDeviceAccounts.mockReturnValue({
    accounts,
    accountCount: accounts.length,
    activeUserId: 'active-1',
    hasAccountLimit: overrides.hasAccountLimit ?? false,
    loading: overrides.loading ?? false,
    reload: mockReload,
  });
}

const drawerProps = {
  state: {
    routes: [
      { key: 'stack', name: '(stack)' },
      { key: 'settings', name: 'settings' },
      { key: 'privacy', name: 'privacy-policy' },
      { key: 'terms', name: 'terms-of-use' },
    ],
    index: 0,
    key: 'drawer',
    routeNames: ['(stack)', 'settings', 'privacy-policy', 'terms-of-use'],
    type: 'drawer',
    stale: false,
  } as unknown as DrawerContentComponentProps['state'],
  navigation: {
    closeDrawer: mockCloseDrawer,
    navigate: mockNavigate,
  } as unknown as DrawerContentComponentProps['navigation'],
  descriptors: {} as DrawerContentComponentProps['descriptors'],
};

describe('UserSettingsMenu', () => {
  const onUserSwitched = jest.fn();
  const onSignOut = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockDrawerStatus = 'closed';
    mockReload.mockResolvedValue(undefined);
    mockCanDismiss.mockReturnValue(false);

    mockGetActiveUserId.mockReturnValue('active-1');
    setDeviceAccountsResult();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  function renderMenu() {
    return render(
      <UserSettingsMenu
        {...drawerProps}
        onSignOut={onSignOut}
        onUserSwitched={onUserSwitched}
      />,
    );
  }

  it('renders More Settings, legal divider, then Privacy/Terms before accounts', () => {
    const { getByTestId, getByText, queryByText, toJSON } = renderMenu();

    expect(getByTestId('settings-menu-more-settings')).toBeTruthy();
    expect(getByTestId('settings-menu-legal-divider')).toBeTruthy();
    expect(getByTestId('settings-menu-privacy-policy')).toBeTruthy();
    expect(getByTestId('settings-menu-terms-of-use')).toBeTruthy();
    expect(getByText('More Settings')).toBeTruthy();
    expect(getByText('Privacy Policy')).toBeTruthy();
    expect(getByText('Terms of Use')).toBeTruthy();
    expect(getByText('Accounts')).toBeTruthy();
    expect(getByText('active@example.com')).toBeTruthy();
    expect(getByText('other@example.com')).toBeTruthy();
    expect(getByTestId('settings-menu-add-user')).toBeTruthy();
    expect(getByTestId('settings-menu-sign-out')).toBeTruthy();
    expect(queryByText('Switch User')).toBeNull();

    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('More Settings')).toBeLessThan(
      tree.indexOf('settings-menu-legal-divider'),
    );
    expect(tree.indexOf('settings-menu-legal-divider')).toBeLessThan(
      tree.indexOf('Privacy Policy'),
    );
    expect(tree.indexOf('Privacy Policy')).toBeLessThan(
      tree.indexOf('Terms of Use'),
    );
    expect(tree.indexOf('Terms of Use')).toBeLessThan(tree.indexOf('Accounts'));
    expect(tree.indexOf('Accounts')).toBeLessThan(tree.indexOf('Sign Out'));
  });

  it('navigates to drawer routes when More Settings / legal items are pressed', () => {
    const { getByTestId } = renderMenu();

    fireEvent.press(getByTestId('settings-menu-more-settings'));
    expect(mockNavigate).toHaveBeenCalledWith('settings');

    fireEvent.press(getByTestId('settings-menu-privacy-policy'));
    expect(mockNavigate).toHaveBeenCalledWith('privacy-policy');

    fireEvent.press(getByTestId('settings-menu-terms-of-use'));
    expect(mockNavigate).toHaveBeenCalledWith('terms-of-use');
  });

  it('uses leading checkmark for active and person icon for inactive (design mock)', () => {
    const { getByTestId } = renderMenu();

    expect(getByTestId('settings-menu-active-active-1')).toBeTruthy();
    expect(getByTestId('settings-menu-inactive-other-2')).toBeTruthy();
  });

  it('applies DrawerItem focused styling to the active account', () => {
    const { getByTestId } = renderMenu();
    const active = getByTestId('settings-menu-account-active-1');
    const inactive = getByTestId('settings-menu-account-other-2');

    expect(active.props.accessibilityState).toEqual({ selected: true });
    // Omit activeBackgroundColor so DrawerItem uses Color(primary).alpha(0.12).
    expect(active.props.activeBackgroundColor).toBe('DEFAULT_ALPHA_PRIMARY');
    expect(active.props.activeTintColor).toBe('#0B50D0');

    expect(inactive.props.accessibilityState).toEqual({ selected: false });
  });

  it('shows the 3-account limit message instead of Add User when capped', () => {
    setDeviceAccountsResult({
      accounts: [
        activeAccount,
        otherAccount,
        {
          userId: 'third-3',
          displayName: 'Third User',
          email: 'third@example.com',
          initials: 'TU',
          isActive: false,
        },
      ],
      hasAccountLimit: true,
    });

    const { getByTestId, queryByTestId } = renderMenu();

    expect(getByTestId('settings-menu-account-limit')).toBeTruthy();
    expect(queryByTestId('settings-menu-add-user')).toBeNull();
  });

  it('navigates to Add User via href when Add User is pressed', () => {
    const { getByTestId } = renderMenu();
    fireEvent.press(getByTestId('settings-menu-add-user'));

    expect(mockCloseDrawer).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(hrefs.addUser);
  });

  it('does nothing when tapping the already-active user', async () => {
    const { getByText } = renderMenu();

    fireEvent.press(getByText('active@example.com'));

    expect(mockSwitchToDeviceAccount).not.toHaveBeenCalled();
    expect(mockCloseDrawer).toHaveBeenCalled();
  });

  it('switches successfully when the target user has a valid session', async () => {
    mockCanDismiss.mockReturnValue(true);
    mockSwitchToDeviceAccount.mockResolvedValueOnce(undefined);
    const { getByText } = renderMenu();

    fireEvent.press(getByText('other@example.com'));

    await waitFor(() => {
      expect(mockSwitchToDeviceAccount).toHaveBeenCalledWith('other-2');
      expect(mockCloseDrawer).toHaveBeenCalled();
      expect(onUserSwitched).toHaveBeenCalled();
      expect(mockDismissAll).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith(
        hrefs.home({ newUserLoading: false }),
      );
    });
  });

  it('shows an alert when switch fails', async () => {
    mockSwitchToDeviceAccount.mockRejectedValueOnce(new Error('missing'));
    const { getByText } = renderMenu();

    fireEvent.press(getByText('other@example.com'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Switch Failed',
        expect.stringContaining('corrupted'),
      );
    });
    expect(onUserSwitched).not.toHaveBeenCalled();
  });

  it('signs out and notifies when switched to another account', async () => {
    mockSignOutCurrentDeviceAccount.mockResolvedValueOnce({
      kind: 'switched',
      userId: 'other-2',
    });

    const { getByText } = renderMenu();
    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(mockSignOutCurrentDeviceAccount).toHaveBeenCalled();
      expect(onUserSwitched).toHaveBeenCalled();
      expect(onSignOut).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith(
        hrefs.home({ newUserLoading: false }),
      );
    });
  });

  it('fully signs out when no accounts remain', async () => {
    mockSignOutCurrentDeviceAccount.mockResolvedValueOnce({
      kind: 'signed_out',
    });

    const { getByText } = renderMenu();
    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(onSignOut).toHaveBeenCalled();
    });
  });

  it('alerts when sign out fails', async () => {
    mockSignOutCurrentDeviceAccount.mockRejectedValueOnce(new Error('boom'));

    const { getByText } = renderMenu();
    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sign Out Failed',
        expect.stringContaining("Couldn't sign out"),
      );
    });
    expect(onSignOut).not.toHaveBeenCalled();
    expect(onUserSwitched).not.toHaveBeenCalled();
  });

  it('reloads accounts whenever the drawer opens', async () => {
    const { rerender } = renderMenu();
    expect(mockReload).not.toHaveBeenCalled();

    mockDrawerStatus = 'open';
    rerender(
      <UserSettingsMenu
        {...drawerProps}
        onSignOut={onSignOut}
        onUserSwitched={onUserSwitched}
      />,
    );

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled();
    });
  });
});
