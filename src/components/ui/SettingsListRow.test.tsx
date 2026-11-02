import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  SettingsDestructiveRow,
  SettingsNavigationRow,
  SettingsSegmentedRow,
  SettingsToggleRow,
} from './SettingsListRow';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    ChevronRight: (props: Record<string, unknown>) =>
      React.createElement(View, { ...props, testID: 'row-chevron' }),
  };
});

const legacy = resolveTheme('legacy');
const next = resolveTheme('next');
const nextColors = next.colors as {
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
  background: string;
  cardBackground: string;
  destructive: string;
};
const originalColors = { ...nextColors };
const scope = (version: 'legacy' | 'next', child: React.ReactNode) => (
  <UiVersionOverride value={version}>{child}</UiVersionOverride>
);

beforeEach(() => {
  jest.clearAllMocks();
  mockPreferenceStore();
  Object.assign(nextColors, {
    foreground: '#123456',
    mutedForeground: '#234567',
    primary: '#345678',
    primaryForeground: '#456789',
    border: '#56789a',
    background: '#6789ab',
    cardBackground: '#789abc',
    destructive: '#89abcd',
  });
});
afterEach(() => Object.assign(nextColors, originalColors));

it('scopes navigation colors while disabled and press behavior stays controlled', () => {
  const onPress = jest.fn();
  const row = (disabled = false) => (
    <SettingsNavigationRow
      title="Navigate"
      subtitle="Enabled detail"
      icon={<Text>Icon</Text>}
      onPress={onPress}
      disabled={disabled}
      disabledSubtitle="Unavailable"
      testID="navigation-row"
    />
  );
  const { rerender } = render(scope('legacy', row()));
  expect(screen.getByText('Navigate')).toHaveStyle({
    color: legacy.colors.foreground,
  });
  expect(screen.getByTestId('navigation-row')).toHaveStyle({
    paddingHorizontal: legacy.spacing.lg,
    paddingVertical: legacy.spacing.md,
  });
  rerender(scope('next', row()));
  expect(screen.getByText('Navigate')).toHaveStyle({ color: '#123456' });
  expect(screen.getByText('Enabled detail')).toHaveStyle({ color: '#234567' });
  expect(screen.getByTestId('row-chevron').props.color).toBe('#234567');
  fireEvent.press(screen.getByTestId('navigation-row'));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(scope('next', row(true)));
  expect(screen.getByText('Navigate')).toHaveStyle({ color: '#234567' });
  // TouchableOpacity's Jest host injects animated opacity; check the unchanged
  // disabled style passed to the control rather than that animation stub.
  expect(
    StyleSheet.flatten(screen.UNSAFE_getByType(TouchableOpacity).props.style),
  ).toMatchObject({ opacity: 0.5 });
  expect(
    screen.getByTestId('navigation-row').props.accessibilityState.disabled,
  ).toBe(true);
  expect(screen.getByText('Unavailable')).toBeTruthy();
  expect(screen.queryByTestId('row-chevron')).toBeNull();
  fireEvent.press(screen.getByTestId('navigation-row'));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(scope('legacy', row()));
  expect(screen.getByText('Navigate')).toHaveStyle({
    color: legacy.colors.foreground,
  });
});

it('scopes Switch colors without changing controlled value or callback', () => {
  const onValueChange = jest.fn();
  const row = (value: boolean) => (
    <SettingsToggleRow
      title="Toggle"
      subtitle="Toggle detail"
      value={value}
      onValueChange={onValueChange}
      testID="toggle-row"
    />
  );
  const { rerender } = render(scope('legacy', row(false)));
  expect(screen.UNSAFE_getByType(Switch).props.trackColor).toEqual({
    false: legacy.colors.border,
    true: legacy.colors.primary,
  });
  rerender(scope('next', row(false)));
  expect(screen.UNSAFE_getByType(Switch).props.trackColor).toEqual({
    false: '#56789a',
    true: '#345678',
  });
  expect(screen.UNSAFE_getByType(Switch).props.thumbColor).toBe('#456789');
  expect(screen.getByText('Toggle')).toHaveStyle({ color: '#123456' });
  expect(screen.UNSAFE_getByType(Switch).props.value).toBe(false);
  fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true);
  expect(onValueChange).toHaveBeenCalledWith(true);
  rerender(scope('next', row(true)));
  expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true);
  rerender(scope('legacy', row(true)));
  expect(screen.UNSAFE_getByType(Switch).props.thumbColor).toBe(
    legacy.colors.primaryForeground,
  );
});

it('scopes segmented selection while responding to value changes without theme changes', () => {
  const onValueChange = jest.fn();
  const row = (value: 'verse' | 'pericope') => (
    <SettingsSegmentedRow
      title="Drafting unit"
      subtitle="Choose unit"
      value={value}
      options={[
        { label: 'Verse', value: 'verse' },
        { label: 'Pericope', value: 'pericope' },
      ]}
      onValueChange={onValueChange}
      testID="unit"
    />
  );
  const { rerender } = render(scope('legacy', row('verse')));
  expect(screen.getByTestId('unit-verse')).toHaveStyle({
    backgroundColor: legacy.colors.background,
  });
  rerender(scope('next', row('verse')));
  expect(screen.getByTestId('unit-verse')).toHaveStyle({
    backgroundColor: '#6789ab',
  });
  expect(screen.getByText('Verse')).toHaveStyle({ color: '#123456' });
  expect(screen.getByText('Pericope')).toHaveStyle({ color: '#234567' });
  fireEvent.press(screen.getByTestId('unit-pericope'));
  expect(onValueChange).toHaveBeenCalledWith('pericope');
  rerender(scope('next', row('pericope')));
  expect(
    screen.getByTestId('unit-pericope').props.accessibilityState.selected,
  ).toBe(true);
  expect(
    screen.getByTestId('unit-verse').props.accessibilityState.selected,
  ).toBe(false);
  expect(screen.getByTestId('unit-pericope')).toHaveStyle({
    backgroundColor: '#6789ab',
  });
  expect(screen.getByText('Pericope')).toHaveStyle({ color: '#123456' });
  expect(screen.getByText('Verse')).toHaveStyle({ color: '#234567' });
  rerender(scope('legacy', row('pericope')));
  expect(screen.getByText('Pericope')).toHaveStyle({
    color: legacy.colors.foreground,
  });
});

it('scopes destructive text without changing press behavior', () => {
  const onPress = jest.fn();
  const row = (
    <SettingsDestructiveRow
      title="Destructive action"
      icon={<Text>Icon</Text>}
      onPress={onPress}
      testID="destructive-row"
    />
  );
  const { rerender } = render(scope('legacy', row));
  expect(screen.getByText('Destructive action')).toHaveStyle({
    color: legacy.colors.destructive,
  });
  rerender(scope('next', row));
  expect(screen.getByText('Destructive action')).toHaveStyle({
    color: '#89abcd',
  });
  fireEvent.press(screen.getByTestId('destructive-row'));
  expect(onPress).toHaveBeenCalledTimes(1);
  rerender(scope('legacy', row));
  expect(screen.getByText('Destructive action')).toHaveStyle({
    color: legacy.colors.destructive,
  });
});
