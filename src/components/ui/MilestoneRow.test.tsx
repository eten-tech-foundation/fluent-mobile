import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MilestoneRow } from './MilestoneRow';
import { MilestoneSummary } from '../../types/db/types';

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    CloudCheck: MockIcon,
    CloudUpload: MockIcon,
    ChevronRight: MockIcon,
  };
});

const milestone: MilestoneSummary = {
  id: 12,
  name: 'Mark',
  projectId: 3,
  projectName: 'Baka NT',
  targetLanguageName: 'Baka',
  milestoneCount: 3,
  syncState: 'none',
};

describe('MilestoneRow', () => {
  it('shows milestone name and project subtitle with count', () => {
    render(<MilestoneRow milestone={milestone} onPress={jest.fn()} />);

    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.getByText('Baka NT · 3 milestones')).toBeTruthy();
    expect(screen.getByTestId('milestone-row-12')).toBeTruthy();
  });

  it('invokes onPress when the row is pressed', () => {
    const onPress = jest.fn();
    render(<MilestoneRow milestone={milestone} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('milestone-row-12'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
