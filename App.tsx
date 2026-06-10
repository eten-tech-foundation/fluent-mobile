import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import BootSplash from 'react-native-bootsplash';
import { logger } from './src/utils/logger';
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
import { appStyles } from './src/app/appStyles';
import { theme } from './src/theme';

const log = logger.create('App');

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [postLoginSyncActive, setPostLoginSyncActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = () => {
    setIsAuthenticated(false);
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

        const activeUserId = getActiveUserId();

        if (activeUserId) {
          const hasToken = await hasCredentials(activeUserId);
          if (hasToken) {
            const creds = await getCredentials(activeUserId);
            setActiveToken(creds?.token ?? null);
            setIsAuthenticated(true);
            setDbReady(true);
            return;
          }
        }

        const storedUserIds = await getAllStoredUserIds();
        log.info('Stored user IDs in keychain', { storedUserIds });

        if (storedUserIds.length > 0) {
          const userId = storedUserIds[0];
          const creds = await getCredentials(userId);
          if (creds?.token) {
            const { switchActiveUser } = await import('./src/services/storage');
            switchActiveUser(userId);
            setActiveToken(creds.token);
            setIsAuthenticated(true);
            setDbReady(true);
            return;
          }
        }

        setDbReady(true);
      } catch (e: unknown) {
        log.error('initApp failed:', { error: String(e) });
        setError((e as Error).message);
        setDbReady(true);
      }
    };

    initApp();
  }, []);

  useEffect(() => {
    if (!dbReady) {
      return;
    }

    BootSplash.hide({ fade: true }).catch(e => {
      log.error('BootSplash hide failed', { error: String(e) });
    });
  }, [dbReady]);

  const handleLoginSuccess = (email: string) => {
    setIsAuthenticated(true);
    setPostLoginSyncActive(true);
    syncAllData(false, email)
      .catch(e => {
        log.error('Post-login sync failed:', { error: e });
      })
      .finally(() => {
        setPostLoginSyncActive(false);
      });
  };

  if (!dbReady) {
    return (
      <GestureHandlerRootView style={appStyles.containerAppInit}>
        <SafeAreaProvider>
          <View style={appStyles.containerAppInit}>
            {error ? (
              <Text style={appStyles.errorTextAppInit}>Error: {error}</Text>
            ) : (
              <>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={appStyles.loadingTextAppInit}>
                  Initializing...
                </Text>
              </>
            )}
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={appStyles.containerAppInit}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppNavigator
            isAuthenticated={isAuthenticated}
            onLoginSuccess={handleLoginSuccess}
            onSignOut={handleSignOut}
            postLoginSyncActive={postLoginSyncActive}
          />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
