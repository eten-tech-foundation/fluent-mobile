import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import BootSplash from 'react-native-bootsplash';
import { logger } from './src/utils/logger';
import { initializeDatabase } from './src/db/index';
import { syncAllData } from './src/services/sync';
import { restoreSession, signOut } from './src/services/authSession';
import AppNavigator from './src/navigation/AppNavigator';
import { onAuthSessionExpired } from './src/services/syncEvents';
import { queryClient } from './src/services/queryClient';
import { appStyles } from './src/app/appStyles';
import { theme } from './src/theme';

const log = logger.create('App');

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [postLoginSyncActive, setPostLoginSyncActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = () => {
    signOut();
    setIsAuthenticated(false);
  };

  useEffect(() => {
    return onAuthSessionExpired(() => {
      log.info('Session expired — returning to login');
      signOut();
      setIsAuthenticated(false);
    });
  }, []);

  useEffect(() => {
    const initApp = async () => {
      try {
        await initializeDatabase();
        const session = await restoreSession();
        setIsAuthenticated(session.authenticated);
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

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView
        style={dbReady ? appStyles.appRoot : appStyles.containerAppInit}
      >
        <SafeAreaProvider>
          {!dbReady ? (
            <View style={appStyles.containerAppInit}>
              {error ? (
                <Text style={appStyles.errorTextAppInit}>Error: {error}</Text>
              ) : (
                <>
                  <ActivityIndicator
                    size="large"
                    color={theme.colors.primary}
                  />
                  <Text style={appStyles.loadingTextAppInit}>
                    Initializing...
                  </Text>
                </>
              )}
            </View>
          ) : (
            <NavigationContainer>
              <AppNavigator
                isAuthenticated={isAuthenticated}
                onLoginSuccess={handleLoginSuccess}
                onAddUserLoginSuccess={handleAddUserLoginSuccess}
                onSignOut={handleSignOut}
                postLoginSyncActive={postLoginSyncActive}
              />
            </NavigationContainer>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default App;
