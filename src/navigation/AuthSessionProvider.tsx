import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { logger } from '../utils/logger';
import { markStartup } from '../utils/startupTrace';
import { initializeDatabase } from '../db/index';
import { syncAllData } from '../services/sync';
import {
  restoreSession,
  signOut as clearAuthSession,
} from '../services/authSession';
import { clearOrphanedPausedTakes } from '../services/pausedTakes';
import {
  startUploadOrchestrator,
  stopUploadOrchestrator,
} from '../services/uploadOrchestrator';
import {
  startUploadProgressNotification,
  stopUploadProgressNotification,
} from '../services/uploadProgressNotification';
import {
  startDownloadQueueAutoResume,
  stopDownloadQueueAutoResume,
} from '../services/downloadQueueAutoResume';
import {
  refreshSyncStatusStoreIfChanged,
  resetSyncStatusStore,
} from '../services/syncStatusStore';
import { registerRecordingUploadWorker } from '../services/recordingSync';
import { isE2eDownloadAutoResumeHoldEnabled } from '../config/e2eDownloadAutoResumeGuard';
import { isE2eUploadHoldEnabled } from '../config/e2eUploadHoldGuard';
import { ApiUser } from '../types/api/responses';
import { appStyles } from '../app/appStyles';
import { theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/useTheme';
import {
  afterFirstPaint,
  armSplashGate,
  hideSplash,
  holdSplashForFirstPaint,
  isLaunchOverlayVisible,
  LAUNCH_OVERLAY_STILL_MS,
  subscribeLaunchOverlay,
} from './splashGate';

const log = logger.create('AuthSession');

registerRecordingUploadWorker();

export type AuthSessionContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  postLoginSyncActive: boolean;
  error: string | null;
  /** Cold login: flip auth + run post-login sync with sync-active UI. */
  signIn: (email: string, preloadedUser?: ApiUser) => void;
  /** Add-user login: keep auth tree; sync in background (no sync-active flag). */
  signInAddUser: (email: string, preloadedUser?: ApiUser) => void;
  signOut: () => void;
  /** After switching device account — bump consumers that reload local user data. */
  userSwitchEpoch: number;
  notifyUserSwitched: () => void;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

const styles = StyleSheet.create({ content: { flex: 1 } });

/**
 * Covers the tree until a screen reports a paint. It is mounted with the
 * provider, so it is already drawn when the native splash falls back and
 * Home is still evaluating (#1000).
 */
function LaunchOverlay() {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    overlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.colors.background,
      zIndex: 2,
    },
  }));
  const [stillLoading, setStillLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () => setStillLoading(true),
      LAUNCH_OVERLAY_STILL_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  const message = stillLoading ? 'Still loading…' : 'Loading your work…';
  return (
    <View
      style={styles.overlay}
      pointerEvents="auto"
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      testID="launch-overlay"
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={appStyles.loadingTextAppInit}>{message}</Text>
    </View>
  );
}

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
    stopUploadProgressNotification();
    stopUploadOrchestrator();
    clearAuthSession();
    setIsAuthenticated(false);
    setPostLoginSyncActive(false);
  }, []);

  useEffect(() => {
    armSplashGate();
  }, []);

  useEffect(() => {
    const initApp = async () => {
      let ready = false;
      try {
        // The session lives in SecureStore and the KV store, not the
        // database, so the two open together (#973).
        const [, session] = await Promise.all([
          initializeDatabase(),
          restoreSession(),
        ]);
        markStartup('session_restored', {
          authenticated: session.authenticated,
        });
        setIsAuthenticated(session.authenticated);
        ready = true;
      } catch (e: unknown) {
        log.error('initApp failed:', { error: String(e) });
        setError((e as Error).message);
      } finally {
        setIsLoading(false);
      }
      if (!ready) return;
      // Housekeeping, off the path to the first screen. Launch recovery
      // (`collectLaunchRecoveries`) skips orphans on its own, so order
      // between the two doesn't matter.
      clearOrphanedPausedTakes()
        .then(removed => {
          markStartup('paused_takes_cleared', { removed });
          if (removed > 0) {
            log.info('Cleared orphaned paused takes on launch', { removed });
          }
        })
        .catch((e: unknown) => {
          log.warn('Clearing orphaned paused takes failed', {
            error: String(e),
          });
        });
    };

    void initApp();
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      stopUploadProgressNotification();
      stopUploadOrchestrator();
      return;
    }

    startUploadProgressNotification();
    // Upload orchestration, download auto-resume, and the first sync-status
    // read wait for Home's first paint (#1002). A cleanup before the paint
    // cancels them, so they never start for a session that already ended.
    let cancelled = false;
    let stopAutoResume: (() => void) | null = null;
    afterFirstPaint(() => {
      if (cancelled) return;
      // E2E holds (DEV + E2E mode + QA API only). Upload hold: with no
      // orchestrator, notifyPendingUploads is a no-op and Sync-page upload
      // controls report "not started". Download hold: auto-resume only.
      if (isE2eUploadHoldEnabled()) {
        log.info('E2E upload hold: leaving upload orchestrator stopped');
      } else {
        startUploadOrchestrator();
      }
      if (isE2eDownloadAutoResumeHoldEnabled()) {
        log.info('E2E download hold: skipping download queue auto-resume');
      } else {
        stopAutoResume = startDownloadQueueAutoResume();
      }
      void refreshSyncStatusStoreIfChanged();
    });
    return () => {
      cancelled = true;
      stopUploadProgressNotification();
      stopUploadOrchestrator();
      stopDownloadQueueAutoResume(stopAutoResume);
      resetSyncStatusStore();
    };
    // userSwitchEpoch: stop/restart so pending downloads cannot resume for the previous account
  }, [isLoading, isAuthenticated, userSwitchEpoch]);

  // The splash comes down when the first screen reports its paint (Home's
  // content, the login form, or the error below), bounded by the gate's
  // fallback; see splashGate.ts.
  useEffect(() => {
    if (!isLoading) holdSplashForFirstPaint();
  }, [isLoading]);

  const runPostLoginSync = useCallback(
    (email: string, preloadedUser?: ApiUser, onComplete?: () => void) => {
      syncAllData(false, email, preloadedUser, {
        // Clear Home full-screen spinner after Tier 1; Tier 2 keeps running (#670).
        onTier1Complete: onComplete,
      })
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
    (email: string, preloadedUser?: ApiUser) => {
      setIsAuthenticated(true);
      setPostLoginSyncActive(true);
      runPostLoginSync(email, preloadedUser, () =>
        setPostLoginSyncActive(false),
      );
    },
    [runPostLoginSync],
  );

  const signInAddUser = useCallback(
    (email: string, preloadedUser?: ApiUser) => {
      runPostLoginSync(email, preloadedUser);
    },
    [runPostLoginSync],
  );

  const notifyUserSwitched = useCallback(() => {
    setUserSwitchEpoch(epoch => epoch + 1);
  }, []);

  const launchOverlayVisible = useSyncExternalStore(
    subscribeLaunchOverlay,
    isLaunchOverlayVisible,
    isLaunchOverlayVisible,
  );

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
      <View style={appStyles.appRoot}>
        {error ? (
          <View
            style={appStyles.containerAppInit}
            onLayout={() => hideSplash('init-error')}
            testID="auth-session-error"
          >
            <Text style={appStyles.errorTextAppInit}>Error: {error}</Text>
          </View>
        ) : isLoading ? (
          <View
            style={appStyles.containerAppInit}
            testID="auth-session-loading"
          >
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={appStyles.loadingTextAppInit}>Initializing...</Text>
          </View>
        ) : (
          // Kept mounted under the overlay so its paint callbacks can still
          // dismiss it; hidden from TalkBack so covered controls are not focusable.
          <View
            style={styles.content}
            importantForAccessibility={
              launchOverlayVisible ? 'no-hide-descendants' : 'auto'
            }
          >
            {children}
          </View>
        )}
        {launchOverlayVisible ? <LaunchOverlay /> : null}
      </View>
    </AuthSessionContext.Provider>
  );
}
