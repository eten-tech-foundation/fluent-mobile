/**
 * @format
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';

const mockHideSplash = jest.fn();
const mockHoldSplashForFirstPaint = jest.fn();
const mockArmSplashGate = jest.fn();
jest.mock('../src/navigation/splashGate', () => ({
  armSplashGate: () => mockArmSplashGate(),
  hideSplash: (...args: unknown[]) => mockHideSplash(...args),
  holdSplashForFirstPaint: () => mockHoldSplashForFirstPaint(),
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
  stopDownloadQueueAutoResume: (...args: unknown[]) =>
    mockStopDownloadQueueAutoResume(...args),
}));

jest.mock('../src/services/recordingSync', () => ({
  registerRecordingUploadWorker: jest.fn(),
}));

const mockRefreshSyncStatusStore = jest.fn(() => Promise.resolve());
const mockResetSyncStatusStore = jest.fn();
jest.mock('../src/services/syncStatusStore', () => ({
  refreshSyncStatusStoreIfChanged: () => mockRefreshSyncStatusStore(),
  resetSyncStatusStore: () => mockResetSyncStatusStore(),
}));

jest.mock('../src/services/uploadProgressNotification', () => ({
  startUploadProgressNotification: () => mockStartUploadProgressNotification(),
  stopUploadProgressNotification: () => mockStopUploadProgressNotification(),
}));

const mockIsE2eUploadHoldEnabled = jest.fn(() => false);
jest.mock('../src/config/e2eUploadHoldGuard', () => ({
  isE2eUploadHoldEnabled: () => mockIsE2eUploadHoldEnabled(),
}));

const mockIsE2eDownloadAutoResumeHoldEnabled = jest.fn(() => false);
jest.mock('../src/config/e2eDownloadAutoResumeGuard', () => ({
  isE2eDownloadAutoResumeHoldEnabled: () =>
    mockIsE2eDownloadAutoResumeHoldEnabled(),
}));

import {
  AuthSessionProvider,
  useAuthSession,
} from '../src/navigation/AuthSessionProvider';

function AuthProbe() {
  const {
    isAuthenticated,
    postLoginSyncActive,
    signIn,
    signOut,
    notifyUserSwitched,
  } = useAuthSession();
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
      <TouchableOpacity testID="switch-user" onPress={notifyUserSwitched}>
        <Text>Switch user</Text>
      </TouchableOpacity>
    </>
  );
}

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestoreSession.mockResolvedValue({ authenticated: false });
    mockSyncAllData.mockResolvedValue(undefined);
    mockIsE2eUploadHoldEnabled.mockReturnValue(false);
    mockIsE2eDownloadAutoResumeHoldEnabled.mockReturnValue(false);
  });

  async function renderRestoredSession() {
    mockRestoreSession.mockResolvedValueOnce({ authenticated: true });
    const utils = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() => {
      expect(utils.getByTestId('auth-flag').props.children).toBe('yes');
    });
    return utils;
  }

  it('bootstraps session, then renders children', async () => {
    const { getByTestId, queryByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    expect(getByTestId('auth-session-loading')).toBeTruthy();
    // A new activity in a live JS runtime shows its own splash to take down.
    expect(mockArmSplashGate).toHaveBeenCalledTimes(1);
    expect(mockHoldSplashForFirstPaint).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(queryByTestId('auth-session-loading')).toBeNull();
      expect(getByTestId('auth-flag').props.children).toBe('no');
    });
    // The splash waits for the first screen's paint (bounded), not for this.
    expect(mockHoldSplashForFirstPaint).toHaveBeenCalledTimes(1);
    expect(mockHideSplash).not.toHaveBeenCalled();
  });

  it('opens the database and restores the session together, then cleans up paused takes (#973)', async () => {
    const { initializeDatabase } = jest.requireMock('../src/db/index') as {
      initializeDatabase: jest.Mock;
    };
    const { clearOrphanedPausedTakes } = jest.requireMock(
      '../src/services/pausedTakes',
    ) as { clearOrphanedPausedTakes: jest.Mock };
    let openDatabase!: () => void;
    initializeDatabase.mockReturnValueOnce(
      new Promise<void>(resolve => {
        openDatabase = resolve;
      }),
    );
    mockRestoreSession.mockResolvedValueOnce({ authenticated: true });
    // Never settles: the first screen must not wait on it.
    clearOrphanedPausedTakes.mockReturnValueOnce(new Promise<number>(() => {}));

    const { getByTestId, queryByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    // The session is read without waiting for the database to open.
    await waitFor(() => expect(mockRestoreSession).toHaveBeenCalledTimes(1));
    expect(getByTestId('auth-session-loading')).toBeTruthy();
    expect(clearOrphanedPausedTakes).not.toHaveBeenCalled();

    await act(async () => {
      openDatabase();
    });
    await waitFor(() => {
      expect(queryByTestId('auth-session-loading')).toBeNull();
      expect(getByTestId('auth-flag').props.children).toBe('yes');
    });
    // Housekeeping runs after the first screen is let through.
    await waitFor(() =>
      expect(clearOrphanedPausedTakes).toHaveBeenCalledTimes(1),
    );
  });

  it('skips paused-take cleanup when bootstrap fails', async () => {
    const { initializeDatabase } = jest.requireMock('../src/db/index') as {
      initializeDatabase: jest.Mock;
    };
    const { clearOrphanedPausedTakes } = jest.requireMock(
      '../src/services/pausedTakes',
    ) as { clearOrphanedPausedTakes: jest.Mock };
    initializeDatabase.mockRejectedValueOnce(new Error('db boom'));

    const { getByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(getByTestId('auth-session-error')).toBeTruthy());
    await act(async () => {});
    expect(clearOrphanedPausedTakes).not.toHaveBeenCalled();
  });

  it('keeps the first screen when paused-take cleanup fails', async () => {
    const { clearOrphanedPausedTakes } = jest.requireMock(
      '../src/services/pausedTakes',
    ) as { clearOrphanedPausedTakes: jest.Mock };
    clearOrphanedPausedTakes.mockRejectedValueOnce(new Error('kv down'));
    mockRestoreSession.mockResolvedValueOnce({ authenticated: true });

    const { getByTestId, queryByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() =>
      expect(clearOrphanedPausedTakes).toHaveBeenCalledTimes(1),
    );
    await act(async () => {});
    expect(getByTestId('auth-flag').props.children).toBe('yes');
    expect(queryByTestId('auth-session-error')).toBeNull();
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
    expect(mockStartDownloadQueueAutoResume).toHaveBeenCalled();
  });

  it('E2E upload hold leaves the orchestrator stopped; downloads and sync unaffected', async () => {
    mockIsE2eUploadHoldEnabled.mockReturnValue(true);
    const { getByTestId } = await renderRestoredSession();

    expect(mockStartUploadOrchestrator).not.toHaveBeenCalled();
    expect(mockStartUploadProgressNotification).toHaveBeenCalled();
    expect(mockStartDownloadQueueAutoResume).toHaveBeenCalled();
    expect(mockRefreshSyncStatusStore).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('sign-in'));
    });
    expect(mockSyncAllData).toHaveBeenCalled();
  });

  it('E2E download hold skips auto-resume; upload orchestrator and sync unaffected', async () => {
    mockIsE2eDownloadAutoResumeHoldEnabled.mockReturnValue(true);
    const { getByTestId } = await renderRestoredSession();

    expect(mockStartDownloadQueueAutoResume).not.toHaveBeenCalled();
    expect(mockStartUploadOrchestrator).toHaveBeenCalled();
    expect(mockRefreshSyncStatusStore).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('sign-in'));
    });
    expect(mockSyncAllData).toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('sign-out'));
    });
    expect(mockStopDownloadQueueAutoResume).toHaveBeenCalledWith(null);
  });

  it('E2E holds apply together and survive an account switch', async () => {
    mockIsE2eUploadHoldEnabled.mockReturnValue(true);
    mockIsE2eDownloadAutoResumeHoldEnabled.mockReturnValue(true);
    const { getByTestId } = await renderRestoredSession();

    await act(async () => {
      fireEvent.press(getByTestId('switch-user'));
    });
    expect(mockResetSyncStatusStore).toHaveBeenCalledTimes(1);
    expect(mockStartUploadOrchestrator).not.toHaveBeenCalled();
    expect(mockStartDownloadQueueAutoResume).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('sign-out'));
    });
    expect(getByTestId('auth-flag').props.children).toBe('no');
    expect(mockStopUploadOrchestrator).toHaveBeenCalled();
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

  it('clears postLoginSyncActive on Tier 1 before syncAllData finishes (#670)', async () => {
    let resolveSync: (() => void) | undefined;
    mockSyncAllData.mockImplementationOnce((...args: unknown[]) => {
      const options = args[3] as { onTier1Complete?: () => void } | undefined;
      return new Promise<void>(resolve => {
        resolveSync = () => resolve();
        Promise.resolve().then(() => options?.onTier1Complete?.());
      });
    });

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

    await waitFor(() => {
      expect(getByTestId('sync-flag').props.children).toBe('no');
    });
    expect(resolveSync).toBeDefined();

    await act(async () => {
      resolveSync?.();
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

  it('refreshes the sync-status store when a session starts', async () => {
    mockRestoreSession.mockResolvedValueOnce({ authenticated: true });
    const { getByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('auth-flag').props.children).toBe('yes');
    });
    expect(mockRefreshSyncStatusStore).toHaveBeenCalled();
  });

  it('does not touch the sync-status store while signed out', async () => {
    const { getByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('auth-flag').props.children).toBe('no');
    });
    expect(mockRefreshSyncStatusStore).not.toHaveBeenCalled();
    expect(mockResetSyncStatusStore).not.toHaveBeenCalled();
  });

  it('resets the sync-status store on sign-out and on user switch', async () => {
    mockRestoreSession.mockResolvedValueOnce({ authenticated: true });
    const { getByTestId } = render(
      <AuthSessionProvider>
        <AuthProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() => {
      expect(getByTestId('auth-flag').props.children).toBe('yes');
    });
    expect(mockResetSyncStatusStore).not.toHaveBeenCalled();

    // User switch: reset the old user's counts, then reload for the new user.
    const refreshesBefore = mockRefreshSyncStatusStore.mock.calls.length;
    await act(async () => {
      fireEvent.press(getByTestId('switch-user'));
    });
    expect(mockResetSyncStatusStore).toHaveBeenCalledTimes(1);
    expect(mockRefreshSyncStatusStore.mock.calls.length).toBe(
      refreshesBefore + 1,
    );

    // Sign-out: reset again, and nothing reloads for a signed-out app.
    await act(async () => {
      fireEvent.press(getByTestId('sign-out'));
    });
    expect(mockResetSyncStatusStore).toHaveBeenCalledTimes(2);
    expect(mockRefreshSyncStatusStore.mock.calls.length).toBe(
      refreshesBefore + 1,
    );
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

    // The error is the first screen: once laid out, it takes the splash down.
    fireEvent(getByTestId('auth-session-error'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 100 } },
    });
    expect(mockHideSplash).toHaveBeenCalledWith('init-error');
  });
});
