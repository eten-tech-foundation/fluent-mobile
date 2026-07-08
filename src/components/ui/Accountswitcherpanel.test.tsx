import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccountSwitcherPanel } from './AccountSwitcherPanel';

const mockNavigate = jest.fn();
const mockReset = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    reset: mockReset,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockAuthTokenSet = jest.fn();
jest.mock('../../services/authToken', () => ({
  authToken: {
    set: (...args: unknown[]) => mockAuthTokenSet(...args),
  },
}));

const mockGetCredentials = jest.fn();
jest.mock('../../services/keychain', () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

const mockSwitchActiveUser = jest.fn();
jest.mock('../../services/storage', () => ({
  switchActiveUser: (...args: unknown[]) => mockSwitchActiveUser(...args),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    create: () => ({
      info: jest.fn(),
      error: jest.fn(),
    }),
  },
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
    accounts: typeof activeAccount[];
    hasAccountLimit: boolean;
    loading: boolean;
  }> = {},
) {
  mockUseDeviceAccounts.mockReturnValue({
    accounts: overrides.accounts ?? [activeAccount, otherAccount],
    accountCount: (overrides.accounts ?? [activeAccount, otherAccount]).length,
    activeUserId: 'active-1',
    hasAccountLimit: overrides.hasAccountLimit ?? false,
    loading: overrides.loading ?? false,
    reload: jest.fn(),
  });
}

describe('AccountSwitcherPanel', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    setDeviceAccountsResult();
  });

  it('renders known accounts with the active row indicated', () => {
    const { getByText, getByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    expect(getByText('Active User')).toBeTruthy();
    expect(getByText('Other User')).toBeTruthy();
    // lucide-react-native's Check icon forwards testID to more than one
    // underlying svg node, so assert the row's accessibility state instead
    // of querying the icon's testID directly (avoids a multi-match error).
    expect(
      getByTestId('account-switcher-row-active-1').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      getByTestId('account-switcher-row-other-2').props.accessibilityState
        .selected,
    ).toBe(false);
  });

  it('shows a loading indicator while accounts are loading', () => {
    setDeviceAccountsResult({ loading: true });
    const { queryByText } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    expect(queryByText('Other User')).toBeNull();
  });

  it('does nothing when tapping the already-active row', () => {
    const { getByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    fireEvent.press(getByTestId('account-switcher-row-active-1'));

    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('switches successfully when the target account has a valid session', async () => {
    mockGetCredentials.mockResolvedValueOnce({ token: 'valid-token' });

    const { getByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    fireEvent.press(getByTestId('account-switcher-row-other-2'));

    await waitFor(() => {
      expect(mockGetCredentials).toHaveBeenCalledWith('other-2');
      expect(mockAuthTokenSet).toHaveBeenCalledWith('valid-token');
      expect(mockSwitchActiveUser).toHaveBeenCalledWith('other-2');
      expect(onClose).toHaveBeenCalled();
      expect(mockReset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Home', params: { newUserLoading: false } }],
      });
    });
  });

  it('shows an error and keeps the current account active when credentials are missing', async () => {
    mockGetCredentials.mockResolvedValueOnce(null);

    const { getByTestId, findByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    fireEvent.press(getByTestId('account-switcher-row-other-2'));

    const errorBanner = await findByTestId('account-switcher-error');
    expect(errorBanner).toBeTruthy();

    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
    expect(mockAuthTokenSet).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('shows an error when the stored session is corrupted (no token field)', async () => {
    mockGetCredentials.mockResolvedValueOnce({ token: '' });

    const { getByTestId, findByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    fireEvent.press(getByTestId('account-switcher-row-other-2'));

    await findByTestId('account-switcher-error');
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
  });

  it('ignores a second tap while a switch is already in progress', async () => {
    let resolveCreds: (value: { token: string } | null) => void = () => {};
    mockGetCredentials.mockReturnValueOnce(
      new Promise(resolve => {
        resolveCreds = resolve;
      }),
    );

    const { getByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    const row = getByTestId('account-switcher-row-other-2');
    fireEvent.press(row);
    fireEvent.press(row); // second tap while first is still resolving

    resolveCreds({ token: 'valid-token' });

    await waitFor(() => {
      expect(mockSwitchActiveUser).toHaveBeenCalledTimes(1);
    });
  });

  it('navigates to Add Account and closes the panel', () => {
    const { getByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    fireEvent.press(getByTestId('account-switcher-add-account'));

    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('AddUser');
  });

  it('shows the account limit message instead of Add Account when at the cap', () => {
    setDeviceAccountsResult({ hasAccountLimit: true });

    const { getByText, queryByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    expect(getByText(/3-account limit/i)).toBeTruthy();
    expect(queryByTestId('account-switcher-add-account')).toBeNull();
  });
});