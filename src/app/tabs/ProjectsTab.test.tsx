import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ProjectsTab } from './ProjectsTab';
import { ProjectSummary } from '../../types/db/types';

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

jest.mock('../../hooks/useProjectsSummary', () => ({
  useProjectsSummary: jest.fn(),
}));

const { useProjectsSummary } = jest.requireMock(
  '../../hooks/useProjectsSummary',
) as {
  useProjectsSummary: jest.Mock;
};

const sampleProjects: ProjectSummary[] = [
  {
    id: 1,
    name: 'Gospel of Mark',
    target_language_name: 'Baka',
    chapterCount: 16,
    syncState: 'unsynced',
    connectivityProfile: null,
  },
  {
    id: 2,
    name: 'Genesis',
    target_language_name: 'Baka',
    chapterCount: 50,
    syncState: 'none',
    connectivityProfile: null,
  },
];

describe('ProjectsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when there are no projects', async () => {
    useProjectsSummary.mockReturnValue({
      projects: [],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<ProjectsTab />);

    expect(
      await screen.findByText(
        'No projects are available right now. Connect to the internet to sync and find available work.',
      ),
    ).toBeTruthy();
  });

  it('renders project rows with language, chapter count, and title', async () => {
    useProjectsSummary.mockReturnValue({
      projects: sampleProjects,
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<ProjectsTab />);

    expect(await screen.findByText('Gospel of Mark')).toBeTruthy();
    expect(await screen.findByText('Baka · 16 chapters')).toBeTruthy();
    expect(await screen.findByText('Genesis')).toBeTruthy();
    expect(await screen.findByText('Baka · 50 chapters')).toBeTruthy();
  });
});
