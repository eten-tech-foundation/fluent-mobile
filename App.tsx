import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { initializeDatabase } from './src/db/index';
import AppNavigator from './src/navigation/AppNavigator';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { syncAllData } from './src/services/syncServices';
import { FLUENT_USER_EMAIL } from '@env';

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('App starting - initializing database...');
        await initializeDatabase();
        console.log('Database initialized successfully');

        const email = FLUENT_USER_EMAIL;
        if (!email) {
          throw new Error('FLUENT_USER_EMAIL not set');
        }

        await syncAllData(email);
        setDbReady(true);
      } catch (e: unknown) {
        console.error('DB Init Failed:', e);
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
