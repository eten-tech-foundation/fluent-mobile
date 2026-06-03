import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ProjectsTab } from './ProjectsTab';
import { ProjectSummary } from '../../types/db/types';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('@react-native-vector-icons/ionicons', () => ({
  Ionicons: () => null,
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

jest.mock('../../db/queries', () => ({
  getProjectsWithSummary: jest.fn(),
}));

const { getProjectsWithSummary } = jest.requireMock('../../db/queries') as {
  getProjectsWithSummary: jest.Mock;
};

const sampleProjects: ProjectSummary[] = [
  {
    id: 1,
    name: 'Gospel of Mark',
    target_language_name: 'Baka',
    chapterCount: 16,
    syncState: 'unsynced',
  },
  {
    id: 2,
    name: 'Genesis',
    target_language_name: 'Baka',
    chapterCount: 50,
    syncState: 'none',
  },
];

describe('ProjectsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when there are no projects', async () => {
    getProjectsWithSummary.mockResolvedValueOnce([]);

    render(<ProjectsTab />);

    expect(
      await screen.findByText(
        'No projects are available right now. Connect to the internet to sync and find available work.',
      ),
    ).toBeTruthy();
  });

  it('renders project rows with language, chapter count, and title', async () => {
    getProjectsWithSummary.mockResolvedValueOnce(sampleProjects);

    render(<ProjectsTab />);

    expect(await screen.findByText('Gospel of Mark')).toBeTruthy();
    expect(await screen.findByText('Baka · 16 chapters')).toBeTruthy();
    expect(await screen.findByText('Genesis')).toBeTruthy();
    expect(await screen.findByText('Baka · 50 chapters')).toBeTruthy();
  });
});
