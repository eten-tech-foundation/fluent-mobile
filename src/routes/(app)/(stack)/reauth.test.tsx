const mockNotifyUserSwitched = jest.fn();
const mockSyncAllData: jest.Mock = jest.fn(() => Promise.resolve());
const mockNavigateFromReauth: jest.Mock = jest.fn();
let loginSuccess: (
  email: string,
  user?: undefined,
  meta?: { offline?: boolean },
) => void = () => {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ returnTo: 'home' }),
}));

jest.mock('../../../app/tabs/LoginScreen', () => ({
  __esModule: true,
  default: (props: {
    onLoginSuccess: (
      email: string,
      user?: undefined,
      meta?: { offline?: boolean },
    ) => void;
  }) => {
    loginSuccess = props.onLoginSuccess;
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'login');
  },
}));

jest.mock('../../../services/sync', () => ({
  syncAllData: (...args: unknown[]) => mockSyncAllData(...args),
}));

jest.mock('../../../services/storage', () => ({
  getUserEmailSync: () => 't@fluent.local',
}));

jest.mock('../../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({ notifyUserSwitched: mockNotifyUserSwitched }),
}));

jest.mock('../../../navigation/reauthNavigation', () => ({
  navigateFromReauth: (...args: unknown[]) => mockNavigateFromReauth(...args),
  parseReauthReturnTo: () => 'home',
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import ReauthRoute from './reauth';

describe('ReauthRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not sync after an offline sign-in', async () => {
    await render(<ReauthRoute />);
    loginSuccess('t@fluent.local', undefined, { offline: true });
    expect(mockNotifyUserSwitched).toHaveBeenCalledTimes(1);
    expect(mockSyncAllData).not.toHaveBeenCalled();
    expect(mockNavigateFromReauth).toHaveBeenCalled();
  });

  it('syncs after an online sign-in', async () => {
    await render(<ReauthRoute />);
    loginSuccess('t@fluent.local');
    expect(mockSyncAllData).toHaveBeenCalledWith(true);
    expect(mockNotifyUserSwitched).not.toHaveBeenCalled();
  });
});
