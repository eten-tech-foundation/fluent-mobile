import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ProjectsTab } from './ProjectsTab';
import { MilestoneSummary } from '../../types/db/types';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    BookOpen: MockIcon,
    ListChecks: MockIcon,
    CloudCheck: MockIcon,
    CloudUpload: MockIcon,
    ChevronRight: MockIcon,
  };
});

jest.mock('../../hooks/useMilestonesSummary', () => ({
  useMilestonesSummary: jest.fn(),
}));

const { useMilestonesSummary } = jest.requireMock(
  '../../hooks/useMilestonesSummary',
) as {
  useMilestonesSummary: jest.Mock;
};

const sampleMilestones: MilestoneSummary[] = [
  {
    id: 10,
    name: 'Mark',
    projectId: 1,
    projectName: 'Baka NT',
    targetLanguageName: 'Baka',
    milestoneCount: 2,
    syncState: 'unsynced',
  },
  {
    id: 11,
    name: 'Genesis',
    projectId: 1,
    projectName: 'Baka NT',
    targetLanguageName: 'Baka',
    milestoneCount: 2,
    syncState: 'none',
  },
];

describe('ProjectsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when there are no milestones', async () => {
    useMilestonesSummary.mockReturnValue({
      milestones: [],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<ProjectsTab />);

    expect(
      await screen.findByText(
        'No milestones are available right now. Connect to the internet to sync and find available work.',
      ),
    ).toBeTruthy();
  });

  it('renders milestone rows with project name and milestone count', async () => {
    useMilestonesSummary.mockReturnValue({
      milestones: sampleMilestones,
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<ProjectsTab />);

    expect(await screen.findByText('Mark')).toBeTruthy();
    expect(await screen.findAllByText('Baka NT · 2 milestones')).toHaveLength(
      2,
    );
    expect(await screen.findByText('Genesis')).toBeTruthy();
    expect(screen.getByTestId('milestone-row-10')).toBeTruthy();
  });
});
