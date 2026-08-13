import React from 'react';
import { Alert } from 'react-native';
import { UserSettingsMenu } from './UserSettingsMenu';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { hrefs } from '../../navigation/hrefs';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockCloseDrawer = jest.fn();
let mockDrawerStatus: 'open' | 'closed' = 'closed';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('expo-router/drawer', () => ({
  useDrawerStatus: () => mockDrawerStatus,
}));

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

describe('UserSettingsMenu', () => {
  const onUserSwitched = jest.fn();
  const onSignOut = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockDrawerStatus = 'closed';
    mockReload.mockResolvedValue(undefined);

    mockGetActiveUserId.mockReturnValue('active-1');
    setDeviceAccountsResult();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  function renderMenu() {
    return render(
      <UserSettingsMenu
        onSignOut={onSignOut}
        onUserSwitched={onUserSwitched}
        onRequestClose={mockCloseDrawer}
      />,
    );
  }

  it('groups accounts under Accounts with Add User below the list', () => {
    const { getByText, getByTestId, queryByText } = renderMenu();

    expect(getByText('Accounts')).toBeTruthy();
    expect(getByText('active@example.com')).toBeTruthy();
    expect(getByText('other@example.com')).toBeTruthy();
    expect(getByTestId('settings-menu-add-user')).toBeTruthy();
    expect(getByText('Add User')).toBeTruthy();
    expect(queryByText('Switch User')).toBeNull();
  });

  it('uses leading checkmark for active and person icon for inactive (design mock)', () => {
    const { getByTestId } = renderMenu();

    expect(getByTestId('settings-menu-active-active-1')).toBeTruthy();
    expect(getByTestId('settings-menu-inactive-other-2')).toBeTruthy();
  });

  it('keeps Add User out of the top group (after Privacy / Terms)', () => {
    const { getByText, getByTestId } = renderMenu();
    const privacy = getByTestId('settings-menu-privacy-policy');
    const terms = getByTestId('settings-menu-terms-of-use');
    const addUser = getByTestId('settings-menu-add-user');
    const accountsLabel = getByText('Accounts');

    expect(privacy).toBeTruthy();
    expect(terms).toBeTruthy();
    expect(accountsLabel).toBeTruthy();
    expect(addUser).toBeTruthy();
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

  it('navigates to settings / privacy / terms via app hrefs', () => {
    const { getByText, getByTestId } = renderMenu();

    fireEvent.press(getByText('More Settings'));
    expect(mockPush).toHaveBeenCalledWith(hrefs.settings);

    fireEvent.press(getByTestId('settings-menu-privacy-policy'));
    expect(mockPush).toHaveBeenCalledWith(hrefs.privacyPolicyApp);

    fireEvent.press(getByTestId('settings-menu-terms-of-use'));
    expect(mockPush).toHaveBeenCalledWith(hrefs.termsOfUseApp);
  });

  it('does nothing when tapping the already-active user', async () => {
    const { getByText } = renderMenu();

    fireEvent.press(getByText('active@example.com'));

    expect(mockSwitchToDeviceAccount).not.toHaveBeenCalled();
    expect(mockCloseDrawer).toHaveBeenCalled();
  });

  it('switches successfully when the target user has a valid session', async () => {
    mockSwitchToDeviceAccount.mockResolvedValueOnce(undefined);
    const { getByText } = renderMenu();

    fireEvent.press(getByText('other@example.com'));

    await waitFor(() => {
      expect(mockSwitchToDeviceAccount).toHaveBeenCalledWith('other-2');
      expect(mockCloseDrawer).toHaveBeenCalled();
      expect(onUserSwitched).toHaveBeenCalled();
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
        onSignOut={onSignOut}
        onUserSwitched={onUserSwitched}
        onRequestClose={mockCloseDrawer}
      />,
    );

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled();
    });
  });
});
