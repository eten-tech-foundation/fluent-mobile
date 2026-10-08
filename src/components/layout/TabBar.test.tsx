import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TabBar } from './TabBar';

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
  it('labels the projects tab Milestones and keeps the existing testID', () => {
    render(<TabBar activeTab="projects" onTabChange={jest.fn()} />);

    expect(screen.getByText('Milestones')).toBeTruthy();
    expect(screen.getByTestId('home-tab-projects')).toBeTruthy();
    expect(screen.queryByText('Projects')).toBeNull();
  });
});
