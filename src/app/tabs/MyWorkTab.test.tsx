import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MyWorkTab } from './MyWorkTab';
import { MyWorkChapter } from '../../types/db/types';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
    Users: MockIcon,
    UsersRound: MockIcon,
    BadgeCheck: MockIcon,
    CircleCheck: MockIcon,
    TriangleAlert: MockIcon,
    ChevronRight: MockIcon,
    ChevronDown: MockIcon,
    ChevronUp: MockIcon,
    User: MockIcon,
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
  assignmentStatus: 'draft',
  workflowStage: 'draft',
  syncState: 'synced',
  ownershipState: 'unassigned',
  completedVerses: 3,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  lastActivityLabel: 'Jun 1, 2024',
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

const notStartedChapter: MyWorkChapter = {
  id: 11,
  displayLabel: 'Luke 16',
  bookName: 'Luke',
  chapterNumber: 16,
  assignmentStatus: 'not_started',
  workflowStage: 'not_started',
  syncState: 'none',
  ownershipState: 'unassigned',
  completedVerses: 0,
  totalVerses: 5,
  downloadedVerses: 0,
  hasConflict: false,
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

const peerChapter: MyWorkChapter = {
  id: 12,
  displayLabel: 'Luke 5',
  bookName: 'Luke',
  chapterNumber: 5,
  assignmentStatus: 'peer_check',
  workflowStage: 'peer_check',
  syncState: 'synced',
  ownershipState: 'mine',
  completedVerses: 1,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  lastActivityLabel: 'Jun 2, 2024',
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

const linguistChapter: MyWorkChapter = {
  id: 13,
  displayLabel: 'Luke 6',
  bookName: 'Luke',
  chapterNumber: 6,
  assignmentStatus: 'linguist_check',
  workflowStage: null,
  syncState: 'synced',
  ownershipState: 'unassigned',
  completedVerses: 1,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  projectName: 'Gospel of Luke',
  targetLanguageName: 'Baka',
};

const theologicalChapter: MyWorkChapter = {
  id: 14,
  displayLabel: 'Luke 7',
  bookName: 'Luke',
  chapterNumber: 7,
  assignmentStatus: 'theological_check',
  workflowStage: null,
  syncState: 'synced',
  ownershipState: 'unassigned',
  completedVerses: 1,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
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

    expect(screen.getByTestId('loading-spinner')).toBeTruthy();
    expect(
      screen.queryByText(
        "You don't have any chapters to work on right now. Check the Milestones tab to find available work.",
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

    expect(await screen.findByTestId('my-work-empty')).toBeTruthy();
    expect(
      screen.getByText(
        "You don't have any chapters to work on right now. Check the Milestones tab to find available work.",
      ),
    ).toBeTruthy();
  });

  it('groups by workflow stage, moves badge into header, and keeps row activity', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [sampleChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(await screen.findByText('Drafting (1)')).toBeTruthy();
    expect(await screen.findByText('Luke 4')).toBeTruthy();
    expect(await screen.findByText('Jun 1, 2024')).toBeTruthy();
    expect(screen.getByTestId('my-work-list')).toBeTruthy();
    expect(screen.getByTestId('my-work-list-end')).toBeTruthy();
    expect(screen.getByLabelText('my-work-count-1')).toBeTruthy();
  });

  it('keeps not_started chapters visible under Drafting without a row badge', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [notStartedChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(await screen.findByText('Drafting (1)')).toBeTruthy();
    expect(await screen.findByText('Luke 16')).toBeTruthy();
    expect(screen.queryByText('Not Started')).toBeNull();
  });

  it('renders distinct advanced stage groups collapsed by default', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [linguistChapter, theologicalChapter, peerChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(await screen.findByText('Peer Check (1)')).toBeTruthy();
    expect(screen.getByText('Linguist Check (1)')).toBeTruthy();
    expect(screen.getByText('Theologian Check (1)')).toBeTruthy();
    expect(screen.queryByText('Luke 5')).toBeNull();
    expect(screen.queryByText('Luke 6')).toBeNull();
    expect(screen.queryByText('Luke 7')).toBeNull();
  });

  it('auto-expands a sole group and allows the user to collapse it', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [sampleChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    expect(await screen.findByText('Luke 4')).toBeTruthy();
    fireEvent.press(screen.getByTestId('my-work-stage-draft-toggle'));
    expect(screen.queryByText('Luke 4')).toBeNull();
  });

  it('navigates to verse detail when a row is pressed', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [sampleChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-10'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(stack)/verse-detail',
      params: {
        chapterId: '10',
        chapterName: 'Luke 4',
        projectName: 'Gospel of Luke',
        language: 'Baka',
      },
    });
  });

  it('retains pull-to-refresh wiring and list end/count markers', async () => {
    const refresh = jest.fn();
    useMyWorkChapters.mockReturnValue({
      chapters: [sampleChapter],
      loading: false,
      refreshing: true,
      refresh,
    });

    render(<MyWorkTab />);

    const list = screen.getByTestId('my-work-list');
    expect(list.props.refreshing).toBe(true);
    expect(screen.getByTestId('my-work-list-end')).toBeTruthy();
    expect(screen.getByLabelText('my-work-count-1')).toBeTruthy();
    fireEvent(list, 'refresh');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
