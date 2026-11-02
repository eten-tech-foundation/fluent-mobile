import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TabBar } from './TabBar';
import { StyleSheet, View } from 'react-native';
import { UiVersionOverride } from '../../theme/useTheme';
import { resolveTheme } from '../../theme/uiVersion';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    BookOpen: MockIcon,
    ListChecks: MockIcon,
  };
});

describe('TabBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferenceStore();
  });
  it('labels the projects tab Milestones and keeps the existing testID', () => {
    render(<TabBar activeTab="projects" onTabChange={jest.fn()} />);

    expect(screen.getByText('Milestones')).toBeTruthy();
    expect(screen.getByTestId('home-tab-projects')).toBeTruthy();
    expect(screen.queryByText('Projects')).toBeNull();
  });
});

function tabContainer() {
  const containers = screen
    .UNSAFE_getAllByType(View)
    .map(node => StyleSheet.flatten(node.props.style))
    .filter(
      style =>
        style?.backgroundColor !== undefined && style?.borderBottomWidth === 1,
    );
  expect(containers).toHaveLength(1);
  return containers[0];
}

it('isolates scoped Next tab styles and updates activeTab without a theme change', () => {
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
    activeTab: 'projects' | 'myWork',
  ) => (
    <UiVersionOverride value={version}>
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />
    </UiVersionOverride>
  );
  try {
    colors.tabBarBackground = '#123456';
    colors.primary = '#234567';
    colors.mutedForeground = '#345678';
    colors.border = '#456789';
    spacing.md = 23;
    const { rerender } = render(tree('legacy', 'projects'));
    expect(tabContainer()).toMatchObject({
      backgroundColor: legacy.colors.tabBarBackground,
      borderBottomColor: legacy.colors.border,
    });
    expect(screen.getByText('Milestones')).toHaveStyle({
      color: legacy.colors.primary,
    });
    expect(screen.getByTestId('home-tab-projects')).toHaveStyle({
      paddingTop: legacy.spacing.md,
      paddingBottom: legacy.spacing.md + 2,
      borderBottomWidth: 2,
    });
    rerender(tree('next', 'projects'));
    expect(tabContainer()).toMatchObject({
      backgroundColor: '#123456',
      borderBottomColor: '#456789',
    });
    expect(screen.getByText('Milestones')).toHaveStyle({ color: '#234567' });
    expect(screen.getByText('My Work')).toHaveStyle({ color: '#345678' });
    expect(screen.getByTestId('home-tab-projects')).toHaveStyle({
      paddingTop: 23,
      paddingBottom: 25,
      borderBottomColor: '#234567',
    });
    fireEvent.press(screen.getByTestId('home-tab-my-work'));
    expect(onTabChange).toHaveBeenCalledWith('myWork');
    rerender(tree('next', 'myWork'));
    expect(screen.getByText('My Work')).toHaveStyle({ color: '#234567' });
    expect(screen.getByText('Milestones')).toHaveStyle({ color: '#345678' });
    expect(
      screen.getByTestId('home-tab-my-work').props.accessibilityState.selected,
    ).toBe(true);
    rerender(tree('legacy', 'myWork'));
    expect(tabContainer()).toMatchObject({
      backgroundColor: legacy.colors.tabBarBackground,
    });
    expect(screen.getByText('My Work')).toHaveStyle({
      color: legacy.colors.primary,
    });
  } finally {
    const { md, ...originalColors } = original;
    Object.assign(colors, originalColors);
    spacing.md = md;
  }
});
