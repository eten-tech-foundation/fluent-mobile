jest.mock('../services/api', () => ({
  FluentAPI: {
    signIn: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  beginLoginSession: jest.fn(() => Promise.resolve()),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { FluentAPI } from '../services/api';
import { beginLoginSession } from '../services/authSession';
import { useLogin } from './useLogin';
import { QueryClientTestWrapper } from '../test/queryClientWrapper';

describe('useLogin', () => {
  const onLoginSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('completes login via react-query mutation on valid input', async () => {
    jest.mocked(FluentAPI.signIn).mockResolvedValue({
      token: 'session-token',
      user: { email: 't@fluent.local' },
    });

    const { result } = renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    act(() => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith('t@fluent.local');
    });

    expect(FluentAPI.signIn).toHaveBeenCalledWith('t@fluent.local', 'secret');
    expect(beginLoginSession).toHaveBeenCalledWith(
      'session-token',
      't@fluent.local',
    );
  });

  it('surfaces API errors from the mutation', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new Error('Invalid credentials'));

    const { result } = renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('wrong');
    });

    await act(async () => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe('Invalid credentials');
    });
  });

  it('does not retry signIn when beginLoginSession fails after a successful signIn', async () => {
    jest.mocked(FluentAPI.signIn).mockResolvedValue({
      token: 'session-token',
      user: { email: 't@fluent.local' },
    });
    jest
      .mocked(beginLoginSession)
      .mockRejectedValue(new Error('Session setup failed'));

    const { result } = renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    act(() => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe('Session setup failed');
    });

    expect(FluentAPI.signIn).toHaveBeenCalledTimes(1);
    expect(FluentAPI.signIn).toHaveBeenCalledWith('t@fluent.local', 'secret');
    expect(onLoginSuccess).not.toHaveBeenCalled();

    act(() => {
      result.current.handleLogin();
    });

    expect(FluentAPI.signIn).toHaveBeenCalledTimes(1);
  });
});
