/**
 * @format
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import App from '../App';

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
  gestureHandlerRootHOC: (comp: unknown) => comp,
  State: {},
  Directions: {},
}));

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

jest.mock('@react-native-vector-icons/ionicons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/assets/icons/fluent-logo.svg', () => 'FluentLogo');

jest.mock('../src/navigation/AppNavigator', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return () => MockReact.createElement(View, { testID: 'app-navigator' });
});

jest.mock('../src/api/fluent-api.test', () => ({
  runApiIntegrationTest: jest.fn(() => Promise.resolve()),
}));

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() =>
    Promise.resolve({
      execute: jest.fn(),
      transaction: jest.fn(async (fn: any) => fn({ execute: jest.fn() })),
    }),
  ),
}));
jest.mock('../src/db/index', () => ({
  initializeDatabase: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/syncServices', () => ({
  syncAllData: jest.fn(() => Promise.resolve()),
}));

test('renders correctly', async () => {
  const { getByTestId } = render(<App />);

  await waitFor(() => {
    expect(getByTestId('app-navigator')).toBeTruthy();
  });
});