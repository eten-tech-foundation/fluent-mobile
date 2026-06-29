import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MyWorkTab } from './MyWorkTab';
import { MyWorkChapter } from '../../types/db/types';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('react-native-svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockSvg = ({ children }: { children?: unknown }) =>
    MockReact.createElement(View, null, children);
  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockSvg,
  };
});

jest.mock('lucide-react-native', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  const MockIcon = () => MockReact.createElement(View);
  return {
    BookOpen: MockIcon,
    ListChecks: MockIcon,
    Cloud: MockIcon,
    CloudCheck: MockIcon,
    CloudUpload: MockIcon,
    Circle: MockIcon,
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
  completedVerses: 3,
  totalVerses: 5,
  downloadedVerses: 5,
  lastActivityLabel: 'Jun 1, 2024',
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

const notStartedChapter: MyWorkChapter = {
  id: 11,
  displayLabel: 'Luke 16',
  bookName: 'Luke',
  chapterNumber: 16,
  workflowStage: 'not_started',
  syncState: 'none',
  completedVerses: 0,
  totalVerses: 5,
  downloadedVerses: 0,
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

describe('MyWorkTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading spinner while syncing with no chapters yet', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab isSyncing />);

    expect(
      screen.queryByText(
        "You don't have any chapters to work on right now. Check the Projects tab to find available work.",
      ),
    ).toBeNull();
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

  it('renders not started badge when source is not downloaded', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [notStartedChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(await screen.findByText('Luke 16')).toBeTruthy();
    expect(await screen.findByText('Not Started')).toBeTruthy();
    expect(screen.queryByText('Source not downloaded')).toBeNull();
  });
});
