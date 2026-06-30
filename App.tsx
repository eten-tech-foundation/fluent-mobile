import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import { logger } from './src/utils/logger';
import { readApiBaseUrl } from './src/config/apiBaseUrl';
import { initializeDatabase } from './src/db/index';
import { syncAllData } from './src/services/sync';
import { getActiveUserId } from './src/services/storage';
import {
  getAllStoredUserIds,
  getCredentials,
  hasCredentials,
} from './src/services/keychain';
import AppNavigator from './src/navigation/AppNavigator';
import { onAuthSessionExpired } from './src/services/syncEvents';
import { setActiveToken } from './src/services/api';
import { checkServerReachable } from './src/services/connectivity';
import { appStyles } from './src/app/appStyles';
import { theme } from './src/theme';

const log = logger.create('App');

const API_CONFIG_ERROR =
  'EXPO_PUBLIC_API_BASE_URL is not set. Copy .env.example to .env, set the API URL, then rebuild the app. See docs/guides/local-development-workflow.md.';

function apiUnreachableMessage(apiUrl: string): string {
  return `Cannot reach the API at ${apiUrl}. Start fluent-api (./fapi.sh up) or use hosted dev — see docs/guides/local-development-workflow.md.`;
}

type InitBlock = {
  message: string;
  canRetry: boolean;
};

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [postLoginSyncActive, setPostLoginSyncActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initBlock, setInitBlock] = useState<InitBlock | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);

  const handleSignOut = () => {
    setIsAuthenticated(false);
  };

  const handleRetryInit = () => {
    setInitBlock(null);
    setError(null);
    setDbReady(false);
    setInitAttempt(attempt => attempt + 1);
  };

  useEffect(() => {
    return onAuthSessionExpired(() => {
      log.info('Session expired — returning to login');
      setActiveToken(null);
      setIsAuthenticated(false);
    });
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        await initializeDatabase();

        const apiUrl = readApiBaseUrl();
        if (!apiUrl) {
          setInitBlock({ message: API_CONFIG_ERROR, canRetry: true });
          setDbReady(true);
          return;
        }

        const restoreSession = async (): Promise<boolean> => {
          const activeUserId = getActiveUserId();

          if (activeUserId) {
            const hasToken = await hasCredentials(activeUserId);
            if (hasToken) {
              const creds = await getCredentials(activeUserId);
              setActiveToken(creds?.token ?? null);
              setIsAuthenticated(true);
              return true;
            }
          }

          const storedUserIds = await getAllStoredUserIds();
          log.info('Stored user IDs in keychain', { storedUserIds });

          if (storedUserIds.length > 0) {
            const userId = storedUserIds[0];
            const creds = await getCredentials(userId);
            if (creds?.token) {
              const { switchActiveUser } = await import(
                './src/services/storage'
              );
              switchActiveUser(userId);
              setActiveToken(creds.token);
              setIsAuthenticated(true);
              return true;
            }
          }

          return false;
        };

        const sessionRestored = await restoreSession();
        if (sessionRestored) {
          setDbReady(true);
          return;
        }

        const reachable = await checkServerReachable();
        if (!reachable) {
          setInitBlock({
            message: apiUnreachableMessage(apiUrl),
            canRetry: true,
          });
          setDbReady(true);
          return;
        }

        setDbReady(true);
      } catch (e: unknown) {
        log.error('initApp failed:', { error: String(e) });
        setError((e as Error).message);
        setDbReady(true);
      }
    };

    initApp();
  }, [initAttempt]);

  useEffect(() => {
    if (!dbReady) {
      return;
    }

    BootSplash.hide({ fade: true }).catch(e => {
      log.error('BootSplash hide failed', { error: String(e) });
    });
  }, [dbReady]);

  const runPostLoginSync = (email: string, onComplete?: () => void) => {
    syncAllData(false, email)
      .catch(e => {
        log.error('Post-login sync failed:', { error: e });
      })
      .finally(() => {
        onComplete?.();
      });
  };

  const handleLoginSuccess = (email: string) => {
    setIsAuthenticated(true);
    setPostLoginSyncActive(true);
    runPostLoginSync(email, () => setPostLoginSyncActive(false));
  };

  const handleAddUserLoginSuccess = (email: string) => {
    runPostLoginSync(email);
  };

  if (!dbReady) {
    return (
      <GestureHandlerRootView style={appStyles.containerAppInit}>
        <SafeAreaProvider>
          <View style={appStyles.containerAppInit}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={appStyles.loadingTextAppInit}>Initializing...</Text>
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (initBlock || error) {
    const message = initBlock?.message ?? error;
    const canRetry = initBlock?.canRetry ?? false;

    return (
      <GestureHandlerRootView style={appStyles.containerAppInit}>
        <SafeAreaProvider>
          <View style={appStyles.containerAppInit}>
            <Text style={appStyles.errorTextAppInit}>{message}</Text>
            {canRetry ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={handleRetryInit}
                style={appStyles.retryButtonAppInit}
              >
                <Text style={appStyles.retryButtonTextAppInit}>Retry</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={appStyles.appRoot}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppNavigator
            isAuthenticated={isAuthenticated}
            onLoginSuccess={handleLoginSuccess}
            onAddUserLoginSuccess={handleAddUserLoginSuccess}
            onSignOut={handleSignOut}
            postLoginSyncActive={postLoginSyncActive}
          />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
