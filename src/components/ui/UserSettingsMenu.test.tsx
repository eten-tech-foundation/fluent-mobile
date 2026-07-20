import React from 'react';
import { Alert } from 'react-native';
import { UserSettingsMenu } from './UserSettingsMenu';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockAuthTokenSet = jest.fn();
jest.mock('../../services/authToken', () => ({
  authToken: { set: (...args: unknown[]) => mockAuthTokenSet(...args) },
}));

const mockGetCredentials = jest.fn();
const mockClearCredentials = jest.fn();
jest.mock('../../services/keychain', () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
  clearCredentials: (...args: unknown[]) => mockClearCredentials(...args),
}));

const mockSwitchActiveUser = jest.fn();
const mockGetActiveUserId = jest.fn();
const mockGetKnownUserIds = jest.fn();
const mockSetItemSync = jest.fn();
jest.mock('../../services/storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  getKnownUserIds: (...args: unknown[]) => mockGetKnownUserIds(...args),
  kvStorage: { setItemSync: (...args: unknown[]) => mockSetItemSync(...args) },
  KV_KEYS: { KNOWN_USER_IDS: 'known_user_ids' },
  switchActiveUser: (...args: unknown[]) => mockSwitchActiveUser(...args),
  MAX_DEVICE_ACCOUNTS: 3,
}));

const mockSignOutApi = jest.fn();
jest.mock('../../services/api', () => ({
  FluentAPI: { signOut: (...args: unknown[]) => mockSignOutApi(...args) },
}));

const mockSignOut = jest.fn();
jest.mock('../../services/authSession', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
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
    reload: jest.fn(),
  });
}

describe('UserSettingsMenu', () => {
  const onClose = jest.fn();
  const onUserSwitched = jest.fn();
  const onSignOut = jest.fn();
  const anchor = { top: 0, left: 0 };

  beforeEach(() => {
    // resetAllMocks (not clearAllMocks) — clearAllMocks only wipes call
    // history, it leaves queued mockReturnValueOnce/mockResolvedValueOnce
    // values in place, which then leak into the next test.
    jest.resetAllMocks();

    mockGetActiveUserId.mockReturnValue('active-1');
    mockGetKnownUserIds.mockReturnValue(['active-1', 'other-2']);
    mockSignOutApi.mockResolvedValue(undefined);
    setDeviceAccountsResult();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  function renderMenu() {
    return render(
      <UserSettingsMenu
        visible
        onClose={onClose}
        anchor={anchor}
        onSignOut={onSignOut}
        onUserSwitched={onUserSwitched}
      />,
    );
  }

  it('groups accounts under Accounts with Add User below the list', () => {
    const { getByText, getByTestId, queryByText } = renderMenu();

    expect(getByText('Accounts')).toBeTruthy();
    expect(getByText('Active User')).toBeTruthy();
    expect(getByText('Other User')).toBeTruthy();
    expect(getByTestId('settings-menu-add-user')).toBeTruthy();
    expect(getByText('Add User')).toBeTruthy();
    expect(queryByText('Switch User')).toBeNull();
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

  it('navigates to AddUser when Add User is pressed', () => {
    const { getByTestId } = renderMenu();
    fireEvent.press(getByTestId('settings-menu-add-user'));

    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('AddUser');
  });

  it('does nothing when tapping the already-active user', async () => {
    const { getByText } = renderMenu();

    fireEvent.press(getByText('Active User'));

    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('switches successfully when the target user has a valid session', async () => {
    mockGetCredentials.mockResolvedValueOnce({ token: 'valid-token' });
    const { getByText } = renderMenu();

    fireEvent.press(getByText('Other User'));

    await waitFor(() => {
      expect(mockAuthTokenSet).toHaveBeenCalledWith('valid-token');
      expect(mockSwitchActiveUser).toHaveBeenCalledWith('other-2');
      expect(onClose).toHaveBeenCalled();
      expect(onUserSwitched).toHaveBeenCalled();
    });
  });

  it('shows an alert and does not switch when credentials are missing', async () => {
    mockGetCredentials.mockResolvedValueOnce(null);
    const { getByText } = renderMenu();

    fireEvent.press(getByText('Other User'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Switch Failed',
        expect.stringContaining('corrupted'),
      );
    });
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
    expect(onUserSwitched).not.toHaveBeenCalled();
  });

  it('shows an alert when the stored session has no token', async () => {
    mockGetCredentials.mockResolvedValueOnce({ token: '' });
    const { getByText } = renderMenu();

    fireEvent.press(getByText('Other User'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
  });

  it('signs out and picks the next known user when remaining accounts exist', async () => {
    mockGetKnownUserIds.mockReturnValue(['active-1', 'other-2']);
    mockGetCredentials.mockResolvedValueOnce({ token: 'next-token' });

    const { getByText } = renderMenu();
    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(mockClearCredentials).toHaveBeenCalledWith('active-1');
      expect(mockSwitchActiveUser).toHaveBeenCalledWith('other-2');
      expect(onUserSwitched).toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  it('fully signs out when no accounts remain', async () => {
    mockGetKnownUserIds.mockReturnValue(['active-1']);
    setDeviceAccountsResult({ accounts: [activeAccount] });

    const { getByText } = renderMenu();
    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(onSignOut).toHaveBeenCalled();
    });
  });
});
