import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ViewProject from './ViewProject';
import { ProjectChapter } from '../../types/db/types';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    navigate: jest.fn(),
  }),
  useRoute: () => ({
    params: {
      projectId: 1,
      projectName: 'Gospel of Luke',
      language: 'Baka',
    },
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
    ChevronLeft: MockIcon,
    ChevronRight: MockIcon,
    CloudUpload: MockIcon,
    CloudCheck: MockIcon,
    Mic: MockIcon,
    UserCheck: MockIcon,
    UsersRound: MockIcon,
    BadgeCheck: MockIcon,
    CircleCheck: MockIcon,
  };
});

jest.mock('../../hooks/useProjectChapters', () => ({
  useProjectChapters: jest.fn(),
}));

jest.mock('../../hooks/useSync', () => ({
  useSync: jest.fn(() => ({
    isSyncing: false,
    triggerSync: jest.fn(),
  })),
}));

jest.mock('../../components/layout/ScreenContainer', () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
}));

const { useProjectChapters } = jest.requireMock(
  '../../hooks/useProjectChapters',
) as {
  useProjectChapters: jest.Mock;
};

const sampleChapter: ProjectChapter = {
  id: 10,
  displayLabel: 'Luke 4',
  bookName: 'Luke',
  chapterNumber: 4,
  workflowStage: 'peer_check',
  syncState: 'synced',
  completedVerses: 3,
  totalVerses: 5,
  downloadedVerses: 5,
  lastActivityLabel: 'Apr 27, 2026',
};

describe('ViewProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders header and chapter rows', async () => {
    useProjectChapters.mockReturnValue({
      chapters: [sampleChapter],
      loading: false,
      refreshing: false,
      error: null,
      refresh: jest.fn(),
      retry: jest.fn(),
    });

    render(<ViewProject />);

    expect(await screen.findByText('Gospel of Luke')).toBeTruthy();
    expect(await screen.findByText('Baka')).toBeTruthy();
    expect(await screen.findByText('Luke 4')).toBeTruthy();
    expect(await screen.findByText('Peer Check')).toBeTruthy();
    expect(await screen.findByText('Apr 27, 2026')).toBeTruthy();
  });

  it('renders empty state when there are no chapters', async () => {
    useProjectChapters.mockReturnValue({
      chapters: [],
      loading: false,
      refreshing: false,
      error: null,
      refresh: jest.fn(),
      retry: jest.fn(),
    });

    render(<ViewProject />);

    expect(
      await screen.findByText('No chapters are available in this project yet.'),
    ).toBeTruthy();
  });

  it('renders error state with try again', async () => {
    const retry = jest.fn();
    useProjectChapters.mockReturnValue({
      chapters: [],
      loading: false,
      refreshing: false,
      error: new Error('load failed'),
      refresh: jest.fn(),
      retry,
    });

    render(<ViewProject />);

    expect(
      await screen.findByText('Unable to load this project.'),
    ).toBeTruthy();
    fireEvent.press(await screen.findByText('Try again'));
    expect(retry).toHaveBeenCalled();
  });
});
