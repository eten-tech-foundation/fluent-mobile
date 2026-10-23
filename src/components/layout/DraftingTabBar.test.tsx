import React from 'react';
import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import { theme } from '../../theme';
import { DraftingTabBar } from './DraftingTabBar';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 16, left: 0 }),
}));

describe('DraftingTabBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });
  it('renders Bible, Resources, Record in Lovable order with active top indicator', () => {
    const onTabChange = jest.fn();
    render(<DraftingTabBar activeTab="record" onTabChange={onTabChange} />);

    const bar = screen.getByTestId('drafting-tab-bar');
    expect(bar).toHaveStyle({
      backgroundColor: theme.colors.tabBarBackground,
    });
    const tabs = within(bar).getAllByRole('tab');
    expect(tabs.map(t => t.props.accessibilityLabel)).toEqual([
      'Bible',
      'Resources',
      'Record',
    ]);
    expect(screen.getByTestId('drafting-tab-bible')).toBeTruthy();
    expect(screen.getByTestId('drafting-tab-resources')).toBeTruthy();
    expect(screen.getByTestId('drafting-tab-record')).toBeTruthy();
    expect(tabs[2]?.props.accessibilityState?.selected).toBe(true);

    fireEvent.press(screen.getByTestId('drafting-tab-resources'));
    expect(onTabChange).toHaveBeenCalledWith('resources');
  });
});

it('isolates Next drafting chrome and keeps safe insets and controlled selection', () => {
  mockPreferenceStore();
  const legacy = resolveTheme('legacy');
  const next = resolveTheme('next');
  const colors = next.colors as {
    tabBarBackground: string;
    primary: string;
    mutedForeground: string;
    border: string;
  };
  const spacing = next.spacing as { md: number };
  const original = { ...colors, md: spacing.md };
  const onTabChange = jest.fn();
  const tree = (
    version: 'legacy' | 'next',
    activeTab: 'bible' | 'resources' | 'record',
  ) => (
    <UiVersionOverride value={version}>
      <DraftingTabBar activeTab={activeTab} onTabChange={onTabChange} />
    </UiVersionOverride>
  );
  try {
    colors.tabBarBackground = '#123456';
    colors.primary = '#234567';
    colors.mutedForeground = '#345678';
    colors.border = '#456789';
    spacing.md = 23;
    const { rerender } = render(tree('legacy', 'bible'));
    expect(screen.getByTestId('drafting-tab-bar')).toHaveStyle({
      backgroundColor: legacy.colors.tabBarBackground,
      paddingBottom: 16,
    });
    expect(screen.getByText('Bible')).toHaveStyle({
      color: legacy.colors.primary,
    });
    rerender(tree('next', 'bible'));
    expect(screen.getByTestId('drafting-tab-bar')).toHaveStyle({
      backgroundColor: '#123456',
      borderTopColor: '#456789',
      paddingBottom: 16,
    });
    expect(screen.getByTestId('drafting-tab-bible')).toHaveStyle({
      paddingTop: 25,
      paddingBottom: 23,
    });
    expect(screen.getByText('Bible')).toHaveStyle({ color: '#234567' });
    expect(screen.getByText('Resources')).toHaveStyle({ color: '#345678' });
    const tabs = within(screen.getByTestId('drafting-tab-bar')).getAllByRole(
      'tab',
    );
    expect(tabs.map(tab => tab.props.accessibilityLabel)).toEqual([
      'Bible',
      'Resources',
      'Record',
    ]);
    fireEvent.press(screen.getByTestId('drafting-tab-resources'));
    expect(onTabChange).toHaveBeenCalledWith('resources');
    rerender(tree('next', 'resources'));
    expect(screen.getByText('Resources')).toHaveStyle({ color: '#234567' });
    expect(screen.getByText('Bible')).toHaveStyle({ color: '#345678' });
    expect(
      screen.getByTestId('drafting-tab-resources').props.accessibilityState
        .selected,
    ).toBe(true);
    rerender(tree('legacy', 'resources'));
    expect(screen.getByTestId('drafting-tab-bar')).toHaveStyle({
      backgroundColor: legacy.colors.tabBarBackground,
      paddingBottom: 16,
    });
    expect(screen.getByText('Resources')).toHaveStyle({
      color: legacy.colors.primary,
    });
  } finally {
    const { md, ...originalColors } = original;
    Object.assign(colors, originalColors);
    spacing.md = md;
  }
});
