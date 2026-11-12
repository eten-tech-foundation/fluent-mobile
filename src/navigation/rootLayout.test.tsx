import React from 'react';
import { render } from '@testing-library/react-native';
import RootLayout from '../routes/_layout';

type Options = { animation?: string } | undefined;

let mockSegments: string[] = [];
let mockAuth = { isAuthenticated: false, isLoading: true };
const mockScreens: Record<string, Options> = {};
const mockRedirects: string[] = [];

jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: React.ReactNode }) => children;
  Stack.Protected = ({
    guard,
    children,
  }: {
    guard: boolean;
    children: React.ReactNode;
  }) => (guard ? children : null);
  Stack.Screen = ({ name, options }: { name: string; options?: Options }) => {
    mockScreens[name] = options;
    return null;
  };
  return {
    Stack,
    useSegments: () => mockSegments,
    Redirect: ({ href }: { href: string }) => {
      mockRedirects.push(href);
      return null;
    },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    DefaultTheme: { colors: {} },
  };
});

jest.mock('expo-navigation-bar', () => ({ NavigationBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('../services/queryClient', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  return { queryClient: new QueryClient() };
});
jest.mock('../app/appStyles', () => ({ appStyles: { appRoot: {} } }));
jest.mock('../theme/useTheme', () => ({
  useTheme: () => ({ colors: { background: '#ffffff' } }),
}));
jest.mock('../theme/UiVersionPreferenceProvider', () => ({
  UiVersionPreferenceProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('../config/componentGallery', () => ({
  isComponentGalleryEnabled: () => false,
}));
jest.mock('./AuthSessionProvider', () => ({
  AuthSessionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useAuthSession: () => mockAuth,
}));
jest.mock('./E2eDevMenuGuard', () => ({ E2eDevMenuGuard: () => null }));
jest.mock('./useUploadSyncNotificationTap', () => ({
  useUploadSyncNotificationTap: () => undefined,
}));

const NO_ANIMATION = { animation: 'none' };

beforeEach(() => {
  mockSegments = [];
  mockAuth = { isAuthenticated: false, isLoading: true };
  for (const key of Object.keys(mockScreens)) delete mockScreens[key];
  mockRedirects.length = 0;
});

describe('root layout launch entry (#886)', () => {
  it('enters saved Home from the launch route without a screen transition', () => {
    const view = render(<RootLayout />);
    expect(mockScreens['(app)']).toBeUndefined();

    mockAuth = { isAuthenticated: true, isLoading: false };
    view.rerender(<RootLayout />);
    expect(mockScreens['(app)']).toEqual(NO_ANIMATION);

    mockSegments = ['(app)', '(stack)'];
    view.rerender(<RootLayout />);
    expect(mockScreens['(app)']).toEqual(NO_ANIMATION);

    view.rerender(<RootLayout />);
    expect(mockScreens['(app)']).toBeUndefined();
  });

  it('keeps the default transition after the first group has been shown', () => {
    mockAuth = { isAuthenticated: true, isLoading: false };
    mockSegments = ['(app)', '(stack)'];
    const view = render(<RootLayout />);

    mockSegments = ['(app)', '(stack)', 'sync'];
    view.rerender(<RootLayout />);
    expect(mockScreens['(app)']).toBeUndefined();
  });

  it('keeps the default transition into Home after signing in', () => {
    mockAuth = { isAuthenticated: false, isLoading: false };
    mockSegments = ['(auth)', 'login'];
    const view = render(<RootLayout />);
    expect(mockScreens['(auth)']).toEqual(NO_ANIMATION);

    view.rerender(<RootLayout />);
    expect(mockScreens['(auth)']).toBeUndefined();

    mockAuth = { isAuthenticated: true, isLoading: false };
    view.rerender(<RootLayout />);
    expect(mockRedirects).toEqual(['/(app)/(stack)']);

    mockSegments = ['(app)', '(stack)'];
    view.rerender(<RootLayout />);
    expect(mockScreens['(app)']).toBeUndefined();
  });
});
