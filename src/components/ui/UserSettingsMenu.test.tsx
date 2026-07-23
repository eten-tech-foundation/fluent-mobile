import React from 'react';
import { Alert, Modal } from 'react-native';
import { UserSettingsMenu } from './UserSettingsMenu';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockGetActiveUserId = jest.fn();
const mockGetKnownUserIds = jest.fn();
const mockGetUserEmail = jest.fn();
jest.mock('../../services/storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  getKnownUserIds: (...args: unknown[]) => mockGetKnownUserIds(...args),
  getUserEmail: (...args: unknown[]) => mockGetUserEmail(...args),
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

describe('UserSettingsMenu', () => {
  const onClose = jest.fn();
  const onUserSwitched = jest.fn();
  const onSignOut = jest.fn();
  const anchor = { top: 0, left: 0 };

  beforeEach(() => {
    jest.resetAllMocks();

    mockGetActiveUserId.mockReturnValue('active-1');
    mockGetKnownUserIds.mockReturnValue(['active-1', 'other-2']);
    mockGetUserEmail.mockImplementation((id: string) =>
      id === 'active-1' ? 'active@example.com' : 'other@example.com',
    );
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

    act(() => {
      utils.UNSAFE_getByType(Modal).props.onShow();
    });

    return utils;
  }

  it('does nothing when tapping the already-active user', async () => {
    const { getByText } = renderMenu();
    await waitFor(() => getByText('active@example.com'));

    fireEvent.press(getByText('active@example.com'));

    expect(mockSwitchToDeviceAccount).not.toHaveBeenCalled();
  });

  it('switches successfully when the target user has a valid session', async () => {
    mockSwitchToDeviceAccount.mockResolvedValueOnce(undefined);
    const { getByText } = renderMenu();
    await waitFor(() => getByText('other@example.com'));

    fireEvent.press(getByText('other@example.com'));

    await waitFor(() => {
      expect(mockSwitchToDeviceAccount).toHaveBeenCalledWith('other-2');
      expect(onClose).toHaveBeenCalled();
      expect(onUserSwitched).toHaveBeenCalled();
    });
  });

  it('shows an alert when switch fails', async () => {
    mockSwitchToDeviceAccount.mockRejectedValueOnce(new Error('missing'));
    const { getByText } = renderMenu();
    await waitFor(() => getByText('other@example.com'));

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
    await waitFor(() => getByText('Sign Out'));
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
    await waitFor(() => getByText('Sign Out'));
    fireEvent.press(getByText('Sign Out'));

    await waitFor(() => {
      expect(onSignOut).toHaveBeenCalled();
    });
  });
});
