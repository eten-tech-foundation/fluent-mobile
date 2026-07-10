import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import LoginScreen from './LoginScreen';
import { FluentAPI } from '../../services/api';
import { beginLoginSession } from '../../services/authSession';
import { QueryClientTestWrapper } from '../../test/queryClientWrapper';

const renderLoginScreen = () =>
  render(<LoginScreen onLoginSuccess={onLoginSuccess} />, {
    wrapper: QueryClientTestWrapper,
  });

let onLoginSuccess: jest.Mock;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('../../services/api', () => ({
  FluentAPI: {
    signIn: jest.fn(),
  },
}));

jest.mock('../../services/authSession', () => ({
  beginLoginSession: jest.fn(() => Promise.resolve()),
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    onLoginSuccess = jest.fn();
    jest.clearAllMocks();
  });

  it('shows validation errors for empty fields', async () => {
    renderLoginScreen();

    fireEvent.press(screen.getByTestId('login-submit-button'));

    expect(await screen.findByTestId('login-email-error')).toBeTruthy();
    expect(screen.getByTestId('login-password-error')).toBeTruthy();
    expect(FluentAPI.signIn).not.toHaveBeenCalled();
  });

  it('calls onLoginSuccess after a successful sign-in', async () => {
    jest.mocked(FluentAPI.signIn).mockResolvedValue({
      token: 'session-token',
      user: { email: 't@fluent.local' },
    });

    renderLoginScreen();

    fireEvent.changeText(
      screen.getByTestId('login-email-input'),
      't@fluent.local',
    );
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'secret');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(FluentAPI.signIn).toHaveBeenCalledWith('t@fluent.local', 'secret');
    });
    expect(beginLoginSession).toHaveBeenCalledWith(
      'session-token',
      't@fluent.local',
    );
    expect(onLoginSuccess).toHaveBeenCalledWith('t@fluent.local');
  });

  it('shows a global error when sign-in fails', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new Error('Invalid credentials'));

    renderLoginScreen();

    fireEvent.changeText(
      screen.getByTestId('login-email-input'),
      't@fluent.local',
    );
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'wrong');
    fireEvent.press(screen.getByTestId('login-submit-button'));

    expect(await screen.findByText('Invalid credentials')).toBeTruthy();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });
});
