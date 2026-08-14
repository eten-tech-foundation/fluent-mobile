import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Stack,
  useSegments,
  Redirect,
  ThemeProvider,
  DefaultTheme,
} from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { queryClient } from '../services/queryClient';
import { appStyles } from '../app/appStyles';
import { theme } from '../theme';
import {
  AuthSessionProvider,
  useAuthSession,
} from '../navigation/AuthSessionProvider';
import {
  classifyRouteGroups,
  getAuthGateDecision,
} from '../navigation/authGate';

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.background,
    card: theme.colors.background,
  },
};

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthSession();
  const segments = useSegments();
  const { inAuthGroup, inAppGroup } = classifyRouteGroups(segments);
  const decision = getAuthGateDecision({
    isLoading,
    isAuthenticated,
    inAuthGroup,
    inAppGroup,
  });

  if (decision.action === 'wait') {
    return null;
  }

  if (decision.action === 'redirect') {
    return <Redirect href={decision.href} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={appStyles.appRoot}>
        <ThemeProvider value={navigationTheme}>
          {/* Edge-to-edge: transparent system bars; dark icons on light chrome. */}
          <NavigationBar style="dark" />
          <AuthSessionProvider>
            <RootNavigator />
          </AuthSessionProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
