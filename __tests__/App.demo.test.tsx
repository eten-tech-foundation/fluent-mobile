/**
 * @format
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock('../src/navigation/AppNavigator', () => {
  const React = require('react');
  const { View } = require('react-native');

  return function MockNavigator() {
    return <View testID="app-navigator" />;
  };
});

jest.mock('../src/db/index', () => ({
  initializeDatabase: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/sync', () => ({
  syncAllData: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/config/demoMode', () => ({
  IS_DEMO_MODE: true,
}));

jest.mock('../src/demo/seedDemoData', () => ({
  seedDemoDataIfNeeded: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/authSession', () => ({
  restoreSession: jest.fn(() => Promise.resolve({ authenticated: false })),
  signOut: jest.fn(),
}));

import App from '../App';
import { seedDemoDataIfNeeded } from '../src/demo/seedDemoData';
import { restoreSession } from '../src/services/authSession';

describe('App demo mode', () => {
  it('seeds demo data and skips restoreSession', async () => {
    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId('app-navigator')).toBeTruthy();
    });

    expect(seedDemoDataIfNeeded).toHaveBeenCalled();
    expect(restoreSession).not.toHaveBeenCalled();
  });
});
