import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TabBar } from './TabBar';
import { StyleSheet } from 'react-native';
import { resolveTheme } from '../../theme';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';
import { getAllByHostType } from '../../test/hostElements';

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
  it('labels the projects tab Milestones and keeps the existing testID', async () => {
    await render(<TabBar activeTab="projects" onTabChange={jest.fn()} />);

    expect(screen.getByText('Milestones')).toBeTruthy();
    expect(screen.getByTestId('home-tab-projects')).toBeTruthy();
    expect(screen.queryByText('Projects')).toBeNull();
  });
});

function tabContainer() {
  const containers = getAllByHostType('View')
    .map(node => StyleSheet.flatten(node.props.style))
    .filter(
      style =>
        style?.backgroundColor !== undefined && style?.borderBottomWidth === 1,
    );
  expect(containers).toHaveLength(1);
  return containers[0];
}

it('isolates scoped Next tab styles and updates activeTab without a theme change', async () => {
  mockPreferenceStore();
  const next = resolveTheme();
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
    _version: 'legacy' | 'next',
    activeTab: 'projects' | 'myWork',
  ) => <TabBar activeTab={activeTab} onTabChange={onTabChange} />;
  try {
    colors.tabBarBackground = '#123456';
    colors.primary = '#234567';
    colors.mutedForeground = '#345678';
    colors.border = '#456789';
    spacing.md = 23;
    const { rerender } = await render(tree('legacy', 'projects'));
    expect(tabContainer()).toMatchObject({
      backgroundColor: next.colors.tabBarBackground,
      borderBottomColor: next.colors.border,
    });
    expect(screen.getByText('Milestones')).toHaveStyle({
      color: next.colors.primary,
    });
    expect(screen.getByTestId('home-tab-projects')).toHaveStyle({
      paddingTop: next.spacing.md,
      paddingBottom: next.spacing.md + 2,
      borderBottomWidth: 2,
    });
    await rerender(tree('next', 'projects'));
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
    await fireEvent.press(screen.getByTestId('home-tab-my-work'));
    expect(onTabChange).toHaveBeenCalledWith('myWork');
    await rerender(tree('next', 'myWork'));
    expect(screen.getByText('My Work')).toHaveStyle({ color: '#234567' });
    expect(screen.getByText('Milestones')).toHaveStyle({ color: '#345678' });
    expect(
      screen.getByTestId('home-tab-my-work').props.accessibilityState.selected,
    ).toBe(true);
    await rerender(tree('legacy', 'myWork'));
    expect(tabContainer()).toMatchObject({
      backgroundColor: next.colors.tabBarBackground,
    });
    expect(screen.getByText('My Work')).toHaveStyle({
      color: next.colors.primary,
    });
  } finally {
    const { md, ...originalColors } = original;
    Object.assign(colors, originalColors);
    spacing.md = md;
  }
});
