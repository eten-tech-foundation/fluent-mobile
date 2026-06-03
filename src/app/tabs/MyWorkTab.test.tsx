import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MyWorkTab } from './MyWorkTab';
import { MyWorkChapter } from '../../types/db/types';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    BookOpen: MockIcon,
    ListChecks: MockIcon,
    Cloud: MockIcon,
    CloudCheck: MockIcon,
    CloudOff: MockIcon,
    Mic: MockIcon,
    UserCheck: MockIcon,
    ChevronRight: MockIcon,
  };
});

jest.mock('../../hooks/useMyWorkChapters', () => ({
  useMyWorkChapters: jest.fn(),
}));

const { useMyWorkChapters } = jest.requireMock(
  '../../hooks/useMyWorkChapters',
) as {
  useMyWorkChapters: jest.Mock;
};

const sampleChapter: MyWorkChapter = {
  id: 10,
  displayLabel: 'Luke 4',
  bookName: 'Luke',
  chapterNumber: 4,
  workflowStage: 'draft',
  syncState: 'synced',
  lastActivityLabel: 'Jun 1, 2024',
  tier1Downloaded: true,
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

const chapterWithoutBadge: MyWorkChapter = {
  id: 11,
  displayLabel: 'John 1',
  bookName: 'John',
  chapterNumber: 1,
  workflowStage: null,
  syncState: 'none',
  tier1Downloaded: false,
  projectName: 'Gospel of John',
  targetLanguageName: 'Baka',
};

describe('MyWorkTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when there are no chapters', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(
      await screen.findByText(
        "You don't have any chapters to work on right now. Check the Projects tab to find available work.",
      ),
    ).toBeTruthy();
  });

  it('renders chapter title, badge, and activity date', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [sampleChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(await screen.findByText('Luke 4')).toBeTruthy();
    expect(await screen.findByText('Draft')).toBeTruthy();
    expect(await screen.findByText('Jun 1, 2024')).toBeTruthy();
  });

  it('omits badge and date when not applicable', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [chapterWithoutBadge],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(await screen.findByText('John 1')).toBeTruthy();
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.queryByText('Peer Check')).toBeNull();
    expect(screen.getByText('Source not downloaded')).toBeTruthy();
  });
});
