jest.mock('../services/api', () => ({
  FluentAPI: {
    signIn: jest.fn(),
  },
}));

const mockSavePasswordVerifier: jest.Mock = jest.fn(() => Promise.resolve());
const mockRestoreOfflineSession: jest.Mock = jest.fn();
const mockSwitchToDeviceAccount: jest.Mock = jest.fn(() => Promise.resolve());

jest.mock('../services/passwordVerifier', () => ({
  savePasswordVerifier: (...args: unknown[]) =>
    mockSavePasswordVerifier(...args),
  restoreOfflineSession: (...args: unknown[]) =>
    mockRestoreOfflineSession(...args),
}));

jest.mock('../services/accountSession', () => ({
  switchToDeviceAccount: (...args: unknown[]) =>
    mockSwitchToDeviceAccount(...args),
}));

jest.mock('../services/authSession', () => ({
  beginLoginSession: jest.fn(() =>
    Promise.resolve({ id: 42, email: 't@fluent.local' }),
  ),
  beginAddAccountSession: jest.fn(() =>
    Promise.resolve({ id: 247, email: 'b@example.com' }),
  ),
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ApiError } from '../types/api/errors';
import { FluentAPI } from '../services/api';
import {
  beginAddAccountSession,
  beginLoginSession,
} from '../services/authSession';
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

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    await act(() => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith('t@fluent.local', {
        id: 42,
        email: 't@fluent.local',
      });
    });

    expect(FluentAPI.signIn).toHaveBeenCalledWith('t@fluent.local', 'secret');
    expect(beginLoginSession).toHaveBeenCalledWith(
      'session-token',
      't@fluent.local',
    );
    expect(mockSavePasswordVerifier).toHaveBeenCalledWith(
      '42',
      'secret',
      'session-token',
    );
  });

  it('keeps an online sign-in successful when the verifier cannot be saved', async () => {
    jest.mocked(FluentAPI.signIn).mockResolvedValue({
      token: 'session-token',
      user: { email: 't@fluent.local' },
    });
    mockSavePasswordVerifier.mockRejectedValueOnce(
      new Error('Native random source unavailable'),
    );

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    await act(() => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith('t@fluent.local', {
        id: 42,
        email: 't@fluent.local',
      });
    });
    expect(mockSavePasswordVerifier).toHaveBeenCalledWith(
      '42',
      'secret',
      'session-token',
    );
    expect(result.current.globalError).toBeNull();
  });

  it('uses beginAddAccountSession when sessionMode is addAccount', async () => {
    jest.mocked(FluentAPI.signIn).mockResolvedValue({
      token: 'session-token',
      user: { email: 'b@example.com' },
    });

    const { result } = await renderHook(
      () => useLogin(onLoginSuccess, { sessionMode: 'addAccount' }),
      {
        wrapper: QueryClientTestWrapper,
      },
    );

    await act(() => {
      result.current.setEmail('b@example.com');
      result.current.setPassword('secret');
    });

    await act(() => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith('b@example.com', {
        id: 247,
        email: 'b@example.com',
      });
    });

    expect(beginAddAccountSession).toHaveBeenCalledWith(
      'session-token',
      'b@example.com',
    );
    expect(beginLoginSession).not.toHaveBeenCalled();
    expect(mockSavePasswordVerifier).toHaveBeenCalledWith(
      '247',
      'secret',
      'session-token',
    );
  });

  it('surfaces API errors from the mutation', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new Error('Invalid credentials'));

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
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

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    await act(() => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe('Session setup failed');
    });

    expect(FluentAPI.signIn).toHaveBeenCalledTimes(1);
    expect(FluentAPI.signIn).toHaveBeenCalledWith('t@fluent.local', 'secret');
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('restores a stored session when the network is down', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new ApiError(0, 'Network request failed'));
    mockRestoreOfflineSession.mockResolvedValue({
      ok: true,
      userId: '42',
      token: 'stored-token',
    });

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    await act(() => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith('t@fluent.local', undefined, {
        offline: true,
      });
    });

    expect(mockSwitchToDeviceAccount).toHaveBeenCalledWith(
      '42',
      'stored-token',
    );
    expect(beginLoginSession).not.toHaveBeenCalled();
    expect(mockSavePasswordVerifier).not.toHaveBeenCalled();
  });

  it('keeps the connection error when no offline verifier is stored', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new ApiError(0, 'Network request failed'));
    mockRestoreOfflineSession.mockResolvedValue({
      ok: false,
      reason: 'no-verifier',
    });

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    await act(async () => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe(
        'Unable to connect. Please check your internet connection and try again.',
      );
    });
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  it('reports a wrong password from the offline verifier', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new ApiError(0, 'Network request failed'));
    mockRestoreOfflineSession.mockResolvedValue({
      ok: false,
      reason: 'mismatch',
    });

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('wrong');
    });

    await act(async () => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe('Incorrect email or password.');
    });
    expect(mockSwitchToDeviceAccount).not.toHaveBeenCalled();
  });

  it('does not restore a stored session when adding an account offline', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new ApiError(0, 'Network request failed'));

    const { result } = await renderHook(
      () => useLogin(onLoginSuccess, { sessionMode: 'addAccount' }),
      { wrapper: QueryClientTestWrapper },
    );

    await act(() => {
      result.current.setEmail('b@example.com');
      result.current.setPassword('secret');
    });

    await act(async () => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe(
        'Unable to connect. Please check your internet connection and try again.',
      );
    });
    expect(mockRestoreOfflineSession).not.toHaveBeenCalled();
    expect(beginAddAccountSession).not.toHaveBeenCalled();
  });

  it('reports the lockout from the offline verifier', async () => {
    jest
      .mocked(FluentAPI.signIn)
      .mockRejectedValue(new ApiError(0, 'Network request failed'));
    mockRestoreOfflineSession.mockResolvedValue({
      ok: false,
      reason: 'locked',
    });

    const { result } = await renderHook(() => useLogin(onLoginSuccess), {
      wrapper: QueryClientTestWrapper,
    });

    await act(() => {
      result.current.setEmail('t@fluent.local');
      result.current.setPassword('secret');
    });

    await act(async () => {
      result.current.handleLogin();
    });

    await waitFor(() => {
      expect(result.current.globalError).toBe(
        'Too many attempts. Wait a moment and try again.',
      );
    });
  });
});
