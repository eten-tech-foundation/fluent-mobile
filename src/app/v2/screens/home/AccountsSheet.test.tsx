import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccountsSheet } from './AccountsSheet';
import { hrefs } from '../../../../navigation/hrefs';
import type { DeviceAccount } from '../../../../hooks/useDeviceAccounts';

const mockPush = jest.fn();
const mockSwitchTo = jest.fn();
const mockAddAccount = jest.fn();
const mockSignOut = jest.fn();
let mockBlocked = false;
let mockAccounts: DeviceAccount[] = [];
let mockAtLimit = false;
let mockLoading = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-gesture-handler', () => {
  const pan = {
    activeOffsetY: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  const Pass = ({ children }: { children: React.ReactNode }) => children;
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: Pass,
    GestureHandlerRootView: Pass,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
  MAX_DEVICE_ACCOUNTS: 3,
}));

jest.mock('../../../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({ signOut: jest.fn(), notifyUserSwitched: jest.fn() }),
}));

jest.mock('../../../../hooks/useDeviceAccounts', () => ({
  useDeviceAccounts: () => ({
    accounts: mockAccounts,
    accountCount: mockAccounts.length,
    hasAccountLimit: mockAtLimit,
    loading: mockLoading,
  }),
}));

jest.mock('../../../../hooks/useAccountActions', () => ({
  useAccountActions: () => ({
    switchingUserId: null,
    switchTo: mockSwitchTo,
    addAccount: mockAddAccount,
    signOut: mockSignOut,
    blockIfRecording: () => mockBlocked,
  }),
}));

function account(
  userId: string,
  displayName: string,
  isActive: boolean,
): DeviceAccount {
  return {
    userId,
    displayName,
    email: `${displayName.split(' ')[0]?.toLowerCase()}@example.org`,
    initials: displayName
      .split(' ')
      .map(w => w[0])
      .join(''),
    isActive,
  };
}

describe('AccountsSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlocked = false;
    mockAtLimit = false;
    mockLoading = false;
    mockAccounts = [
      account('1', 'Jordan Smith', true),
      account('2', 'Ravi Kumar', false),
    ];
  });

  it("lists this device's accounts and switches to another", () => {
    const onClose = jest.fn();
    render(<AccountsSheet visible onClose={onClose} />);

    expect(
      screen.getByRole('button', { name: 'Jordan Smith, signed in' }).props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByText('ravi@example.org')).toBeTruthy();

    fireEvent.press(
      screen.getByRole('button', { name: 'Switch to Ravi Kumar' }),
    );
    expect(mockSwitchTo).toHaveBeenCalledWith('2');
  });

  it('counts accounts toward the limit and adds one', () => {
    render(<AccountsSheet visible onClose={jest.fn()} />);

    fireEvent.press(
      screen.getByRole('button', {
        name: 'Add account, 2 of 3 on this device',
      }),
    );
    expect(mockAddAccount).toHaveBeenCalled();
  });

  it("can't add a fourth account", () => {
    mockAtLimit = true;
    mockAccounts = [...mockAccounts, account('3', 'Ana Lima', false)];
    render(<AccountsSheet visible onClose={jest.fn()} />);

    fireEvent.press(
      screen.getByRole('button', {
        name: 'Add account, 3 of 3 on this device',
      }),
    );
    expect(mockAddAccount).not.toHaveBeenCalled();
  });

  it('opens Settings, unless a take is recording', () => {
    const onClose = jest.fn();
    render(<AccountsSheet visible onClose={onClose} />);

    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(hrefs.settings);

    mockPush.mockClear();
    mockBlocked = true;
    fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('logs out of the active account', () => {
    render(<AccountsSheet visible onClose={jest.fn()} />);

    fireEvent.press(
      screen.getByRole('button', { name: 'Log out, Jordan Smith' }),
    );
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('shows just the name when it is the email', () => {
    mockAccounts = [
      {
        ...account('1', 'Jordan Smith', true),
        displayName: 'jordan@example.org',
      },
    ];
    render(<AccountsSheet visible onClose={jest.fn()} />);

    expect(screen.getAllByText('jordan@example.org')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'jordan@example.org, signed in' }),
    ).toBeTruthy();
  });

  it('waits for the accounts before counting them', () => {
    mockLoading = true;
    mockAccounts = [];
    render(<AccountsSheet visible onClose={jest.fn()} />);

    expect(screen.getByTestId('home-accounts-loading')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeTruthy();
  });
});
