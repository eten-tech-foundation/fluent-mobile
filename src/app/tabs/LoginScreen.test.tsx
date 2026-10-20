import React, { type PropsWithChildren } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import LoginScreen from './LoginScreen';
import { FluentAPI } from '../../services/api';
import { beginLoginSession } from '../../services/authSession';
import {
  createTestQueryClient,
  QueryClientTestWrapper,
} from '../../test/queryClientWrapper';

let testClient: ReturnType<typeof createTestQueryClient>;
function LoginTestWrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientTestWrapper client={testClient}>
      {children}
    </QueryClientTestWrapper>
  );
}

const renderLoginScreen = () =>
  render(<LoginScreen onLoginSuccess={onLoginSuccess} />, {
    wrapper: LoginTestWrapper,
  });

let onLoginSuccess: jest.Mock;

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({
    signIn: jest.fn(),
    signInAddUser: jest.fn(),
    signOut: jest.fn(),
    notifyUserSwitched: jest.fn(),
    isAuthenticated: false,
    isLoading: false,
    postLoginSyncActive: false,
    error: null,
    userSwitchEpoch: 0,
  }),
}));

jest.mock('../../services/api', () => ({
  FluentAPI: {
    signIn: jest.fn(),
  },
}));

jest.mock('../../services/authSession', () => ({
  beginLoginSession: jest.fn(() =>
    Promise.resolve({ id: 42, email: 't@fluent.local' }),
  ),
}));

describe('LoginScreen', () => {
  beforeEach(() => {
    testClient = createTestQueryClient();
    testClient.setDefaultOptions({
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    });
    onLoginSuccess = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    testClient.clear();
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
    expect(onLoginSuccess).toHaveBeenCalledWith('t@fluent.local', {
      id: 42,
      email: 't@fluent.local',
    });
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

  it('hides forgot-password and legal footer in reauth variant', () => {
    render(
      <LoginScreen
        onLoginSuccess={onLoginSuccess}
        initialEmail="t@fluent.local"
        variant="reauth"
      />,
      { wrapper: LoginTestWrapper },
    );

    expect(screen.queryByTestId('login-forgot-password-link')).toBeNull();
    expect(screen.queryByTestId('login-privacy-link')).toBeNull();
    expect(screen.queryByTestId('login-terms-link')).toBeNull();
    expect(screen.getByText('Sign in again')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ['auth', 'default', '/(auth)/privacy-policy', '/(auth)/terms-of-use'],
    ['app', 'addAccount', '/(app)/privacy-policy', '/(app)/terms-of-use'],
  ] as const)(
    'routes legal footer links to the %s group for %s login',
    (legalLinksGroup, variant, privacy, terms) => {
      render(
        <LoginScreen
          onLoginSuccess={onLoginSuccess}
          legalLinksGroup={legalLinksGroup}
          variant={variant}
        />,
        { wrapper: LoginTestWrapper },
      );
      fireEvent.press(screen.getByTestId('login-privacy-link'));
      fireEvent.press(screen.getByTestId('login-terms-link'));
      expect(mockPush).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenNthCalledWith(1, privacy);
      expect(mockPush).toHaveBeenNthCalledWith(2, terms);
      expect(FluentAPI.signIn).not.toHaveBeenCalled();
      expect(beginLoginSession).not.toHaveBeenCalled();
      expect(onLoginSuccess).not.toHaveBeenCalled();
    },
  );
});
