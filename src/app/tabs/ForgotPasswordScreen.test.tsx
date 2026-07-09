import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import { FluentAPI } from '../../services/api';
import { QueryClientTestWrapper } from '../../test/queryClientWrapper';

const renderForgotPasswordScreen = () =>
  render(<ForgotPasswordScreen />, { wrapper: QueryClientTestWrapper });

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: { initialEmail: 't@fluent.local' },
  }),
}));

jest.mock('../../services/api', () => ({
  FluentAPI: {
    forgotPassword: jest.fn(),
  },
}));

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a validation error for an invalid email', async () => {
    renderForgotPasswordScreen();

    fireEvent.changeText(
      screen.getByTestId('forgot-password-email-input'),
      'not-an-email',
    );
    fireEvent.press(screen.getByTestId('forgot-password-submit-button'));

    expect(
      await screen.findByText('Please enter a valid email address'),
    ).toBeTruthy();
    expect(FluentAPI.forgotPassword).not.toHaveBeenCalled();
  });

  it('renders the sent state after a successful request', async () => {
    jest.mocked(FluentAPI.forgotPassword).mockResolvedValue({});

    renderForgotPasswordScreen();

    fireEvent.press(screen.getByTestId('forgot-password-submit-button'));

    await waitFor(() => {
      expect(FluentAPI.forgotPassword).toHaveBeenCalledWith('t@fluent.local');
    });
    expect(screen.getByTestId('forgot-password-sent-view')).toBeTruthy();
  });

  it('resends the reset email from the sent state', async () => {
    jest.mocked(FluentAPI.forgotPassword).mockResolvedValue({});

    renderForgotPasswordScreen();
    fireEvent.press(screen.getByTestId('forgot-password-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('forgot-password-sent-view')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('forgot-password-resend-button'));
    fireEvent.press(screen.getByTestId('forgot-password-submit-button'));

    await waitFor(() => {
      expect(FluentAPI.forgotPassword).toHaveBeenCalledTimes(2);
    });
  });
});
