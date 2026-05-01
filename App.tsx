import { logger } from './src/utils/logger';
import { syncAllData } from './src/services/sync';
import React, { useEffect, useState } from 'react';
import { initializeDatabase } from './src/db/index';
import AppNavigator from './src/navigation/AppNavigator';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { FLUENT_USER_EMAIL } from '@env';

const log = logger.create('App');

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        log.info('App starting - initializing database...');
        await initializeDatabase();
        log.info('Database initialized successfully');

        const email = FLUENT_USER_EMAIL;
        if (!email) {
          throw new Error('FLUENT_USER_EMAIL not set');
        }

        await syncAllData(email);
        setDbReady(true);
      } catch (e: unknown) {
        log.error('DB Init Failed:', { error: e });
        setError((e as Error).message);
      }
    };

    initApp();
  }, []);

  if (!dbReady) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          {error ? (
            <Text style={styles.errorText}>Error: {error}</Text>
          ) : (
            <>
              <ActivityIndicator size="large" color="#1a6ef5" />
              <Text style={styles.loadingText}>Initializing...</Text>
            </>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 14,
    padding: 20,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
  },
});

export default App;
