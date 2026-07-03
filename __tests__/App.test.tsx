/**
 * @format
 */

import React from 'react';
import App from '../App';
import { render, waitFor } from '@testing-library/react-native';
import BootSplash from 'react-native-bootsplash';

// Native splash screen
jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(undefined),
}));

// React Native Navigation
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));

// Safe Area
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  }),
}));

// Gesture Handler
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
  gestureHandlerRootHOC: (comp: unknown) => comp,
  State: {},
  Directions: {},
}));

// Vector Icons
jest.mock('@react-native-vector-icons/ionicons', () => ({
  Ionicons: () => null,
}));

// SVG Logo
jest.mock('../src/assets/icons/fluent-logo.svg', () => 'FluentLogo');

// Navigator
jest.mock('../src/navigation/AppNavigator', () => {
  const React = require('react');
  const { View } = require('react-native');

  return function MockNavigator() {
    return <View testID="app-navigator" />;
  };
});

// Database
jest.mock('../src/db/index', () => ({
  initializeDatabase: jest.fn(() => Promise.resolve()),
}));

// Sync
jest.mock('../src/services/sync', () => ({
  syncAllData: jest.fn(() => Promise.resolve()),
}));

// Auth session
jest.mock('../src/services/authSession', () => ({
  restoreSession: jest.fn(() => Promise.resolve({ authenticated: false })),
  signOut: jest.fn(),
}));

// Keychain
jest.mock('../src/services/keychain', () => ({
  hasCredentials: jest.fn(() => Promise.resolve(false)),
  getCredentials: jest.fn(() => Promise.resolve(null)),
  getAllStoredUserIds: jest.fn(() => Promise.resolve([])),
}));

describe('App', () => {
  it('renders navigator after initialization', async () => {
    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId('app-navigator')).toBeTruthy();
    });
    expect(BootSplash.hide).toHaveBeenCalledWith({ fade: true });
  });
});
