import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ReauthBanner } from './ReauthBanner';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';
import {
  REAUTH_PROMPT_SUBTITLE,
  REAUTH_PROMPT_TITLE,
} from '../../constants/messages';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
let mockBottomInset = 7;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    top: 0,
    bottom: mockBottomInset,
    left: 0,
    right: 0,
  }),
}));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AlertCircle: (props: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: 'reauth-warning-icon' }),
    ChevronRight: (props: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: 'reauth-chevron-icon' }),
  };
});

const legacy = resolveTheme('legacy');
const next = resolveTheme('next');
const colors = next.colors as {
  cardBackground: string;
  foreground: string;
  destructive: string;
  mutedForeground: string;
};
const spacing = next.spacing as { lg: number };
const radius = next.radius as { lg: number };
const original = {
  colors: { ...colors },
  spacing: spacing.lg,
  radius: radius.lg,
};
let mockPlatform: 'android' | 'ios' = 'android';

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferenceStore();
  mockBottomInset = 7;
  mockPlatform = 'android';
  jest
    .spyOn(Platform, 'select')
    .mockImplementation(
      specifics =>
        specifics[mockPlatform] ??
        ('default' in specifics ? specifics.default : undefined),
    );
  Object.assign(colors, {
    cardBackground: '#123456',
    foreground: '#234567',
    destructive: '#345678',
    mutedForeground: '#456789',
  });
  spacing.lg = 27;
  radius.lg = 29;
});
afterEach(() => {
  Object.assign(colors, original.colors);
  spacing.lg = original.spacing;
  radius.lg = original.radius;
  jest.restoreAllMocks();
});

function cardStyle(view: ReturnType<typeof render>) {
  const cards = view
    .UNSAFE_getAllByType(View)
    .map(node => StyleSheet.flatten(node.props.style))
    .filter(
      style =>
        style?.backgroundColor !== undefined &&
        style?.borderRadius !== undefined,
    );
  expect(cards).toHaveLength(1);
  return cards[0];
}

it('isolates scoped Next banner colors/layout, follows safe inset and calls the row callback', () => {
  const onSignInAgain = jest.fn();
  const tree = (version: 'legacy' | 'next') => (
    <UiVersionOverride value={version}>
      <ReauthBanner onSignInAgain={onSignInAgain} />
    </UiVersionOverride>
  );
  const view = render(tree('legacy'));
  expect(view.getByTestId('reauth-banner')).toHaveStyle({
    position: 'absolute',
    left: legacy.spacing.lg,
    right: legacy.spacing.lg,
    bottom: legacy.spacing.lg + 7,
    zIndex: 10,
  });
  expect(view.getByTestId('reauth-banner').props.pointerEvents).toBe(
    'box-none',
  );
  expect(cardStyle(view)).toMatchObject({
    backgroundColor: legacy.colors.cardBackground,
    borderRadius: legacy.radius.lg,
    elevation: 2,
  });
  expect(view.getByTestId('reauth-warning-icon').props.color).toBe(
    legacy.colors.destructive,
  );
  expect(view.getByText(REAUTH_PROMPT_TITLE)).toBeTruthy();
  expect(view.getByText(REAUTH_PROMPT_SUBTITLE)).toBeTruthy();
  view.rerender(tree('next'));
  expect(view.getByTestId('reauth-banner')).toHaveStyle({
    left: 27,
    right: 27,
    bottom: 34,
    zIndex: 10,
  });
  expect(cardStyle(view)).toMatchObject({
    backgroundColor: '#123456',
    borderRadius: 29,
    elevation: 2,
  });
  expect(cardStyle(view).shadowColor).toBeUndefined();
  expect(view.getByTestId('reauth-warning-icon').props.color).toBe('#345678');
  expect(view.getByTestId('reauth-chevron-icon').props.color).toBe('#456789');
  expect(view.getByText(REAUTH_PROMPT_TITLE)).toHaveStyle({ color: '#234567' });
  mockBottomInset = 19;
  view.rerender(tree('next'));
  expect(view.getByTestId('reauth-banner')).toHaveStyle({ bottom: 46 });
  fireEvent.press(view.getByText(REAUTH_PROMPT_TITLE));
  expect(onSignInAgain).toHaveBeenCalledTimes(1);
  view.rerender(tree('legacy'));
  expect(view.getByTestId('reauth-banner')).toHaveStyle({
    left: legacy.spacing.lg,
    right: legacy.spacing.lg,
    bottom: legacy.spacing.lg + 19,
  });
  expect(cardStyle(view)).toMatchObject({
    backgroundColor: legacy.colors.cardBackground,
    borderRadius: legacy.radius.lg,
    elevation: 2,
  });
  expect(view.getByTestId('reauth-warning-icon').props.color).toBe(
    legacy.colors.destructive,
  );
  expect(onSignInAgain).toHaveBeenCalledTimes(1);
});

it('preserves the existing iOS shadow selection while its color follows the scoped theme', () => {
  mockPlatform = 'ios';
  const tree = (version: 'legacy' | 'next') => (
    <UiVersionOverride value={version}>
      <ReauthBanner onSignInAgain={jest.fn()} />
    </UiVersionOverride>
  );
  const view = render(tree('legacy'));
  expect(cardStyle(view)).toMatchObject({
    shadowColor: legacy.colors.foreground,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  });
  expect(cardStyle(view).elevation).toBeUndefined();
  view.rerender(tree('next'));
  expect(cardStyle(view)).toMatchObject({
    shadowColor: '#234567',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  });
  expect(cardStyle(view).elevation).toBeUndefined();
  view.rerender(tree('legacy'));
  expect(cardStyle(view).shadowColor).toBe(legacy.colors.foreground);
});
