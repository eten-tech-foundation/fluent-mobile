import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  SettingsDestructiveRow,
  SettingsNavigationRow,
  SettingsSegmentedRow,
  SettingsToggleRow,
} from './SettingsListRow';
import { resolveTheme } from '../../theme';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';
import { getByHostType } from '../../test/hostElements';

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

const next = resolveTheme();
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
const scope = (child: React.ReactElement) => child;

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

it('dims a row that mounts disabled', async () => {
  await render(
    scope(
      <SettingsNavigationRow
        title="Navigate"
        subtitle="Enabled detail"
        icon={<Text>Icon</Text>}
        onPress={jest.fn()}
        disabled
        disabledSubtitle="Unavailable"
        testID="navigation-row"
      />,
    ),
  );

  expect(screen.getByTestId('navigation-row')).toHaveStyle({ opacity: 0.5 });
});

it('scopes navigation colors while disabled and press behavior stays controlled', async () => {
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
  const { rerender } = await render(scope(row()));
  expect(screen.getByText('Navigate')).toHaveStyle({
    color: next.colors.foreground,
  });
  expect(screen.getByTestId('navigation-row')).toHaveStyle({
    paddingHorizontal: next.spacing.lg,
    paddingVertical: next.spacing.md,
  });
  await rerender(scope(row()));
  expect(screen.getByText('Navigate')).toHaveStyle({ color: '#123456' });
  expect(screen.getByText('Enabled detail')).toHaveStyle({ color: '#234567' });
  expect(screen.getByTestId('row-chevron').props.color).toBe('#234567');
  await fireEvent.press(screen.getByTestId('navigation-row'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await rerender(scope(row(true)));
  expect(screen.getByText('Navigate')).toHaveStyle({ color: '#234567' });
  expect(
    screen.getByTestId('navigation-row').props.accessibilityState.disabled,
  ).toBe(true);
  expect(screen.getByText('Unavailable')).toBeTruthy();
  expect(screen.queryByTestId('row-chevron')).toBeNull();
  await fireEvent.press(screen.getByTestId('navigation-row'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await rerender(scope(row()));
  expect(screen.getByText('Navigate')).toHaveStyle({
    color: next.colors.foreground,
  });
});

// Jest renders the iOS host, which takes the track colours as separate props.
const trackColors = () => {
  const host = getByHostType('RCTSwitch').props;
  return { false: host.tintColor, true: host.onTintColor };
};

it('scopes Switch colors without changing controlled value or callback', async () => {
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
  const { rerender } = await render(scope(row(false)));
  expect(trackColors()).toEqual({
    false: next.colors.border,
    true: next.colors.primary,
  });
  await rerender(scope(row(false)));
  expect(trackColors()).toEqual({
    false: '#56789a',
    true: '#345678',
  });
  expect(getByHostType('RCTSwitch').props.thumbTintColor).toBe('#456789');
  expect(screen.getByText('Toggle')).toHaveStyle({ color: '#123456' });
  expect(getByHostType('RCTSwitch').props.value).toBe(false);
  await fireEvent(getByHostType('RCTSwitch'), 'valueChange', true);
  expect(onValueChange).toHaveBeenCalledWith(true);
  await rerender(scope(row(true)));
  expect(getByHostType('RCTSwitch').props.value).toBe(true);
  await rerender(scope(row(true)));
  expect(getByHostType('RCTSwitch').props.thumbTintColor).toBe(
    next.colors.primaryForeground,
  );
});

it('scopes segmented selection while responding to value changes without theme changes', async () => {
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
  const { rerender } = await render(scope(row('verse')));
  expect(screen.getByTestId('unit-verse')).toHaveStyle({
    backgroundColor: next.colors.background,
  });
  await rerender(scope(row('verse')));
  expect(screen.getByTestId('unit-verse')).toHaveStyle({
    backgroundColor: '#6789ab',
  });
  expect(screen.getByText('Verse')).toHaveStyle({ color: '#123456' });
  expect(screen.getByText('Pericope')).toHaveStyle({ color: '#234567' });
  await fireEvent.press(screen.getByTestId('unit-pericope'));
  expect(onValueChange).toHaveBeenCalledWith('pericope');
  await rerender(scope(row('pericope')));
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
  await rerender(scope(row('pericope')));
  expect(screen.getByText('Pericope')).toHaveStyle({
    color: next.colors.foreground,
  });
});

it('scopes destructive text without changing press behavior', async () => {
  const onPress = jest.fn();
  const row = (
    <SettingsDestructiveRow
      title="Destructive action"
      icon={<Text>Icon</Text>}
      onPress={onPress}
      testID="destructive-row"
    />
  );
  const { rerender } = await render(scope(row));
  expect(screen.getByText('Destructive action')).toHaveStyle({
    color: next.colors.destructive,
  });
  await rerender(scope(row));
  expect(screen.getByText('Destructive action')).toHaveStyle({
    color: '#89abcd',
  });
  await fireEvent.press(screen.getByTestId('destructive-row'));
  expect(onPress).toHaveBeenCalledTimes(1);
  await rerender(scope(row));
  expect(screen.getByText('Destructive action')).toHaveStyle({
    color: next.colors.destructive,
  });
});
