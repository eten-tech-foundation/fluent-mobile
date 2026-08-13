import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import BootSplash from 'react-native-bootsplash';
import { logger } from '../utils/logger';
import { initializeDatabase } from '../db/index';
import { syncAllData } from '../services/sync';
import {
  restoreSession,
  signOut as clearAuthSession,
} from '../services/authSession';
import { clearOrphanedPausedTakes } from '../services/pausedTakes';
import { onAuthSessionExpired } from '../services/syncEvents';
import {
  startUploadOrchestrator,
  stopUploadOrchestrator,
} from '../services/uploadOrchestrator';
import {
  startDownloadQueueAutoResume,
  stopDownloadQueueAutoResume,
} from '../services/downloadQueueAutoResume';
import { registerRecordingUploadWorker } from '../services/recordingSync';
import { appStyles } from '../app/appStyles';
import { theme } from '../theme';

const log = logger.create('AuthSession');

registerRecordingUploadWorker();

export type AuthSessionContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  postLoginSyncActive: boolean;
  error: string | null;
  /** Cold login: flip auth + run post-login sync with sync-active UI. */
  signIn: (email: string) => void;
  /** Add-user login: keep auth tree; sync in background (no sync-active flag). */
  signInAddUser: (email: string) => void;
  signOut: () => void;
  /** After switching device account — bump consumers that reload local user data. */
  userSwitchEpoch: number;
  notifyUserSwitched: () => void;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }
  return value;
}

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [postLoginSyncActive, setPostLoginSyncActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSwitchEpoch, setUserSwitchEpoch] = useState(0);

  const signOut = useCallback(() => {
    stopUploadOrchestrator();
    clearAuthSession();
    setIsAuthenticated(false);
    setPostLoginSyncActive(false);
  }, []);

  useEffect(() => {
    return onAuthSessionExpired(() => {
      log.info('Session expired — returning to login');
      stopUploadOrchestrator();
      clearAuthSession();
      setIsAuthenticated(false);
      setPostLoginSyncActive(false);
    });
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        await initializeDatabase();
        const removed = await clearOrphanedPausedTakes();
        if (removed > 0) {
          log.info('Cleared orphaned paused takes on launch', { removed });
        }
        const session = await restoreSession();
        setIsAuthenticated(session.authenticated);
      } catch (e: unknown) {
        log.error('initApp failed:', { error: String(e) });
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    void initApp();
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      stopUploadOrchestrator();
      return;
    }

    startUploadOrchestrator();
    const stopAutoResume = startDownloadQueueAutoResume();
    return () => {
      stopUploadOrchestrator();
      stopDownloadQueueAutoResume(stopAutoResume);
    };
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    BootSplash.hide({ fade: true }).catch(e => {
      log.error('BootSplash hide failed', { error: String(e) });
    });
  }, [isLoading]);

  const runPostLoginSync = useCallback(
    (email: string, onComplete?: () => void) => {
      syncAllData(false, email)
        .catch(e => {
          log.error('Post-login sync failed:', { error: e });
        })
        .finally(() => {
          onComplete?.();
        });
    },
    [],
  );

  const signIn = useCallback(
    (email: string) => {
      setIsAuthenticated(true);
      setPostLoginSyncActive(true);
      runPostLoginSync(email, () => setPostLoginSyncActive(false));
    },
    [runPostLoginSync],
  );

  const signInAddUser = useCallback(
    (email: string) => {
      runPostLoginSync(email);
    },
    [runPostLoginSync],
  );

  const notifyUserSwitched = useCallback(() => {
    setUserSwitchEpoch(epoch => epoch + 1);
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      isLoading,
      isAuthenticated,
      postLoginSyncActive,
      error,
      signIn,
      signInAddUser,
      signOut,
      userSwitchEpoch,
      notifyUserSwitched,
    }),
    [
      isLoading,
      isAuthenticated,
      postLoginSyncActive,
      error,
      signIn,
      signInAddUser,
      signOut,
      userSwitchEpoch,
      notifyUserSwitched,
    ],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {isLoading ? (
        <View style={appStyles.containerAppInit} testID="auth-session-loading">
          {error ? (
            <Text style={appStyles.errorTextAppInit}>Error: {error}</Text>
          ) : (
            <>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={appStyles.loadingTextAppInit}>Initializing...</Text>
            </>
          )}
        </View>
      ) : (
        children
      )}
    </AuthSessionContext.Provider>
  );
}
