/**
 * @format
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import BootSplash from 'react-native-bootsplash';

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/db/index', () => ({
  initializeDatabase: jest.fn(() => Promise.resolve()),
}));

const mockSyncAllData = jest.fn(
  (..._args: unknown[]): Promise<void> => Promise.resolve(),
);
jest.mock('../src/services/sync', () => ({
  syncAllData: (...args: unknown[]) => mockSyncAllData(...args),
}));

jest.mock('../src/services/pausedTakes', () => ({
  clearOrphanedPausedTakes: jest.fn(() => Promise.resolve(0)),
}));

const mockRestoreSession = jest.fn(() =>
  Promise.resolve({ authenticated: false }),
);
const mockSignOut = jest.fn();
jest.mock('../src/services/authSession', () => ({
  restoreSession: () => mockRestoreSession(),
  signOut: () => mockSignOut(),
}));

const mockStartUploadOrchestrator = jest.fn();
const mockStopUploadOrchestrator = jest.fn();
jest.mock('../src/services/uploadOrchestrator', () => ({
  startUploadOrchestrator: () => mockStartUploadOrchestrator(),
  stopUploadOrchestrator: () => mockStopUploadOrchestrator(),
  setChapterUploadWorker: jest.fn(),
}));

const mockStartUploadProgressNotification = jest.fn();
const mockStopUploadProgressNotification = jest.fn();

const mockStartDownloadQueueAutoResume = jest.fn(() => jest.fn());
const mockStopDownloadQueueAutoResume = jest.fn();
jest.mock('../src/services/downloadQueueAutoResume', () => ({
  startDownloadQueueAutoResume: () => mockStartDownloadQueueAutoResume(),
  stopDownloadQueueAutoResume: () => mockStopDownloadQueueAutoResume(),
}));

jest.mock('../src/services/recordingSync', () => ({
  registerRecordingUploadWorker: jest.fn(),
}));

jest.mock('../src/services/uploadProgressNotification', () => ({
  startUploadProgressNotification: () => mockStartUploadProgressNotification(),
  stopUploadProgressNotification: () => mockStopUploadProgressNotification(),
}));

jest.mock('../src/services/syncEvents', () => ({
  onAuthSessionExpired: jest.fn(() => jest.fn()),
}));

import {
  AuthSessionProvider,
  useAuthSession,
} from '../src/navigation/AuthSessionProvider';

function AuthProbe() {
  const { isAuthenticated, postLoginSyncActive, signIn, signOut } =
    useAuthSession();
  return (
    <>
      <Text testID="auth-flag">{isAuthenticated ? 'yes' : 'no'}</Text>
      <Text testID="sync-flag">{postLoginSyncActive ? 'yes' : 'no'}</Text>
      <TouchableOpacity
        testID="sign-in"
        onPress={() => signIn('user@example.com')}
      >
        <Text>Sign in</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="sign-out" onPress={signOut}>
        <Text>Sign out</Text>
      </TouchableOpacity>
    </>
  );
}

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestoreSession.mockResolvedValue({ authenticated: false });
    mockSyncAllData.mockResolvedValue(undefined);
  });

  it('bootstraps session, then renders children', async () => {
    const { getByTestId, queryByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    expect(getByTestId('auth-session-loading')).toBeTruthy();

    await waitFor(() => {
      expect(queryByTestId('auth-session-loading')).toBeNull();
      expect(getByTestId('auth-flag').props.children).toBe('no');
    });
    expect(BootSplash.hide).toHaveBeenCalledWith({ fade: true });
  });

  it('restores auth and starts upload orchestrator', async () => {
    mockRestoreSession.mockResolvedValueOnce({ authenticated: true });
    const { getByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('auth-flag').props.children).toBe('yes');
    });
    expect(mockStartUploadOrchestrator).toHaveBeenCalled();
    expect(mockStartUploadProgressNotification).toHaveBeenCalled();
  });

  it('signIn runs post-login sync with sync-active UI', async () => {
    let resolveSync: (() => void) | undefined;
    mockSyncAllData.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSync = () => resolve(undefined);
        }),
    );

    const { getByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('auth-flag').props.children).toBe('no');
    });

    await act(async () => {
      fireEvent.press(getByTestId('sign-in'));
    });
    expect(getByTestId('sync-flag').props.children).toBe('yes');

    await act(async () => {
      resolveSync?.();
    });
    await waitFor(() => {
      expect(getByTestId('sync-flag').props.children).toBe('no');
    });
  });

  it('signOut clears auth', async () => {
    mockRestoreSession.mockResolvedValueOnce({ authenticated: true });
    const { getByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('auth-flag').props.children).toBe('yes');
    });

    await act(async () => {
      fireEvent.press(getByTestId('sign-out'));
    });
    expect(getByTestId('auth-flag').props.children).toBe('no');
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockStopUploadProgressNotification).toHaveBeenCalled();
  });

  it('shows init error when bootstrap fails', async () => {
    const { initializeDatabase } = jest.requireMock('../src/db/index') as {
      initializeDatabase: jest.Mock;
    };
    initializeDatabase.mockRejectedValueOnce(new Error('db boom'));

    const { getByTestId, queryByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('auth-session-error')).toBeTruthy();
    });
    expect(queryByTestId('auth-flag')).toBeNull();
  });
});
