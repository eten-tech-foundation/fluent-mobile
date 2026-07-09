import React from 'react';
import { Alert, Modal } from 'react-native';
import { UserSettingsMenu } from './UserSettingsMenu';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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
const mockGetUserEmail = jest.fn();
const mockSetItemSync = jest.fn();
jest.mock('../../services/storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  getKnownUserIds: (...args: unknown[]) => mockGetKnownUserIds(...args),
  getUserEmail: (...args: unknown[]) => mockGetUserEmail(...args),
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
    mockGetUserEmail.mockImplementation((id: string) =>
      id === 'active-1' ? 'active@example.com' : 'other@example.com',
    );
    mockSignOutApi.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  function renderMenu() {
    const utils = render(
      <UserSettingsMenu
        visible
        onClose={onClose}
        anchor={anchor}
        onSignOut={onSignOut}
        onUserSwitched={onUserSwitched}
      />,
    );

    // The real Modal fires onShow natively; RN's test-environment Modal
    // mock doesn't simulate that, so the component's onShow-triggered
    // loadKnownUsers() never runs unless we fire it ourselves.
    act(() => {
      utils.UNSAFE_getByType(Modal).props.onShow();
    });

    return utils;
  }

  it('does nothing when tapping the already-active user', async () => {
    const { getByText } = renderMenu();
    await waitFor(() => getByText('active@example.com'));

    fireEvent.press(getByText('active@example.com'));

    expect(mockGetCredentials).not.toHaveBeenCalled();
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
  });

  it('switches successfully when the target user has a valid session', async () => {
    mockGetCredentials.mockResolvedValueOnce({ token: 'valid-token' });
    const { getByText } = renderMenu();
    await waitFor(() => getByText('other@example.com'));

    fireEvent.press(getByText('other@example.com'));

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
    await waitFor(() => getByText('other@example.com'));

    fireEvent.press(getByText('other@example.com'));

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
    await waitFor(() => getByText('other@example.com'));

    fireEvent.press(getByText('other@example.com'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
    expect(mockSwitchActiveUser).not.toHaveBeenCalled();
  });

  it('signs out and picks the next known user when remaining accounts exist', async () => {
    mockGetKnownUserIds.mockReturnValue(['active-1', 'other-2']);
    mockGetCredentials.mockResolvedValueOnce({ token: 'next-token' });

    const { getByText } = renderMenu();
    await waitFor(() => getByText('Sign Out'));
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

    const { getByText } = renderMenu();
    await waitFor(() => getByText('Sign Out'));
    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(onSignOut).toHaveBeenCalled();
    });
  });
});
