import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { AccountSwitcherPanel } from './AccountSwitcherPanel';
import { StyleSheet, View } from 'react-native';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockCanDismiss = jest.fn(() => false);
const mockNotifyUserSwitched = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    dismissAll: mockDismissAll,
    canDismiss: mockCanDismiss,
  }),
}));

jest.mock('../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    notifyUserSwitched: mockNotifyUserSwitched,
  }),
}));

let mockBottomInset = 0;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: mockBottomInset,
    left: 0,
    right: 0,
  }),
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
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
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
    accounts: (typeof activeAccount)[];
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
    mockPreferenceStore();
    mockBottomInset = 0;
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
      expect(mockNotifyUserSwitched).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/(stack)',
        params: { newUserLoading: 'false' },
      });
    });
  });

  it('clears the nested stack with dismissAll when the stack can dismiss', async () => {
    mockCanDismiss.mockReturnValueOnce(true);
    mockGetCredentials.mockResolvedValueOnce({ token: 'valid-token' });

    const { getByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    fireEvent.press(getByTestId('account-switcher-row-other-2'));

    await waitFor(() => {
      expect(mockDismissAll).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalled();
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
    expect(mockReplace).not.toHaveBeenCalled();
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
    expect(mockPush).toHaveBeenCalledWith('/(app)/(stack)/add-user');
  });

  it('shows the account limit message instead of Add Account when at the cap', () => {
    setDeviceAccountsResult({ hasAccountLimit: true });

    const { getByText, queryByTestId } = render(
      <AccountSwitcherPanel visible onClose={onClose} />,
    );

    expect(getByText(/3-account limit/i)).toBeTruthy();
    expect(queryByTestId('account-switcher-add-account')).toBeNull();
  });

  it('closes a capped three-account panel without changing the active session or navigation', () => {
    const thirdAccount = {
      userId: 'third-3',
      displayName: 'Third User',
      email: 'third@example.com',
      initials: 'TU',
      isActive: false,
    };
    const accounts = [activeAccount, otherAccount, thirdAccount];
    setDeviceAccountsResult({ accounts, hasAccountLimit: true });

    const {
      getByText,
      getByTestId,
      getByLabelText,
      queryByTestId,
      queryByRole,
    } = render(<AccountSwitcherPanel visible onClose={onClose} />);

    for (const account of accounts) {
      const row = getByTestId(`account-switcher-row-${account.userId}`);
      expect(within(row).getByText(account.displayName)).toBeTruthy();
      expect(within(row).getByText(account.initials)).toBeTruthy();
      expect(row.props.accessibilityState.selected).toBe(account.isActive);
    }
    expect(getByText("You've reached the 3-account limit.")).toBeTruthy();
    expect(queryByTestId('account-switcher-add-account')).toBeNull();
    expect(
      queryByRole('button', { name: /remove|delete|forget|sign out|log out/i }),
    ).toBeNull();

    fireEvent.press(getByLabelText('Close account switcher'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockAuthTokenSet).not.toHaveBeenCalled();
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
    expect(mockNotifyUserSwitched).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockDismissAll).not.toHaveBeenCalled();
  });

  it('isolates Next panel colors and spacing while preserving Legacy and session behavior', () => {
    const legacy = resolveTheme('legacy');
    const next = resolveTheme('next');
    const colors = next.colors as {
      background: string;
      foreground: string;
      border: string;
      primary: string;
      drawerOverlay: string;
    };
    const spacing = next.spacing as { lg: number };
    const radius = next.radius as { lg: number };
    const sizes = next.typography.sizes as { xl: number };
    const original = {
      colors: { ...colors },
      spacing: spacing.lg,
      radius: radius.lg,
      titleSize: sizes.xl,
    };
    const panel = (version: 'legacy' | 'next') => (
      <UiVersionOverride value={version}>
        <AccountSwitcherPanel visible onClose={onClose} />
      </UiVersionOverride>
    );
    const surfaces = () => {
      const styles = screen
        .UNSAFE_getAllByType(View)
        .map(node => StyleSheet.flatten(node.props.style));
      const backdrops = styles.filter(
        style =>
          style?.flex === 1 &&
          style?.justifyContent === 'flex-end' &&
          style?.backgroundColor !== undefined,
      );
      const sheets = styles.filter(
        style =>
          style?.borderTopWidth === 1 &&
          style?.borderTopLeftRadius !== undefined,
      );
      expect(backdrops).toHaveLength(1);
      expect(sheets).toHaveLength(1);
      return [backdrops[0], sheets[0]];
    };
    try {
      Object.assign(colors, {
        background: '#123456',
        foreground: '#234567',
        border: '#345678',
        primary: '#456789',
        drawerOverlay: 'rgba(1, 2, 3, 0.5)',
      });
      spacing.lg = 27;
      radius.lg = 29;
      sizes.xl = 31;
      const { rerender } = render(panel('legacy'));
      expect(surfaces()[0]).toMatchObject({
        backgroundColor: legacy.colors.drawerOverlay,
      });
      expect(surfaces()[1]).toMatchObject({
        backgroundColor: legacy.colors.background,
        borderTopLeftRadius: legacy.radius.lg,
        paddingBottom: legacy.spacing.lg,
      });
      expect(screen.getByText('Accounts on this device')).toHaveStyle({
        color: legacy.colors.foreground,
        fontSize: legacy.typography.sizes.xl,
      });
      rerender(panel('next'));
      expect(surfaces()[0]).toMatchObject({
        backgroundColor: 'rgba(1, 2, 3, 0.5)',
      });
      expect(surfaces()[1]).toMatchObject({
        backgroundColor: '#123456',
        borderColor: '#345678',
        borderTopLeftRadius: 29,
        borderTopRightRadius: 29,
        paddingBottom: 27,
      });
      expect(screen.getByText('Accounts on this device')).toHaveStyle({
        color: '#234567',
        fontSize: 31,
      });
      expect(screen.getByTestId('account-switcher-row-active-1')).toHaveStyle({
        backgroundColor: '#F3F7FF',
        borderLeftColor: '#456789',
      });
      expect(screen.getByTestId('account-switcher-row-other-2')).toHaveStyle({
        borderTopColor: '#345678',
      });
      mockBottomInset = 11;
      rerender(panel('next'));
      expect(surfaces()[1]).toMatchObject({ paddingBottom: 38 });
      rerender(panel('legacy'));
      expect(surfaces()[0]).toMatchObject({
        backgroundColor: legacy.colors.drawerOverlay,
      });
      expect(surfaces()[1]).toMatchObject({
        backgroundColor: legacy.colors.background,
        borderTopLeftRadius: legacy.radius.lg,
        paddingBottom: legacy.spacing.lg + 11,
      });
      expect(screen.getByText('Accounts on this device')).toHaveStyle({
        color: legacy.colors.foreground,
        fontSize: legacy.typography.sizes.xl,
      });
      expect(mockGetCredentials).not.toHaveBeenCalled();
      expect(mockAuthTokenSet).not.toHaveBeenCalled();
      expect(mockSwitchActiveUser).not.toHaveBeenCalled();
      expect(mockNotifyUserSwitched).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    } finally {
      Object.assign(colors, original.colors);
      spacing.lg = original.spacing;
      radius.lg = original.radius;
      sizes.xl = original.titleSize;
    }
  });
});
