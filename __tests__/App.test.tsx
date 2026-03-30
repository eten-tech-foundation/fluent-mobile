/**
 * @format
 */

import React from 'react';
import { render } from '@testing-library/react-native';
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

// mock AppNavigator to return something renderable
jest.mock('../src/navigation/AppNavigator', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return () => MockReact.createElement(View, { testID: 'app-navigator' });
});
jest.mock('../src/api/fluent-api.test', () => ({
  runApiIntegrationTest: jest.fn(() => Promise.resolve()),
}));

test('renders correctly', () => {
  const { getByTestId } = render(<App />);
  expect(getByTestId('app-navigator')).toBeTruthy();
});
