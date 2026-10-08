import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ViewProject from './ViewProject';
import { ProjectChapter } from '../../types/db/types';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({
    projectId: '1',
    projectUnitId: '10',
    projectName: 'Baka NT',
    milestoneName: 'Mark',
    language: 'Baka',
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
    Path: MockSvg,
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
    CloudOff: MockIcon,
    Mic: MockIcon,
    UserCheck: MockIcon,
    Users: MockIcon,
    UsersRound: MockIcon,
    TriangleAlert: MockIcon,
    BadgeCheck: MockIcon,
    CircleCheck: MockIcon,
    User: MockIcon,
  };
});

jest.mock('../../hooks/useMilestoneChapters', () => ({
  useMilestoneChapters: jest.fn(),
}));

jest.mock('../../hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: jest.fn(() => false),
}));

jest.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: jest.fn(() => ({
    status: 'online_synced',
    isOnline: true,
    pendingCount: 0,
    hasPendingUploads: false,
    needsDownloadSync: false,
  })),
}));

jest.mock('../../components/layout/ScreenContainer', () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { useMilestoneChapters } = jest.requireMock(
  '../../hooks/useMilestoneChapters',
) as {
  useMilestoneChapters: jest.Mock;
};

const sampleChapter: ProjectChapter = {
  id: 10,
  displayLabel: 'Luke 4',
  bookName: 'Luke',
  chapterNumber: 4,
  workflowStage: 'peer_check',
  syncState: 'synced',
  ownershipState: 'unassigned',
  completedVerses: 3,
  totalVerses: 5,
  downloadedVerses: 5,
  hasConflict: false,
  lastActivityLabel: 'Apr 27, 2026',
};

describe('ViewProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders header and chapter rows', async () => {
    useMilestoneChapters.mockReturnValue({
      chapters: [sampleChapter],
      loading: false,
      refreshing: false,
      error: null,
      refresh: jest.fn(),
      retry: jest.fn(),
    });

    render(<ViewProject />);

    expect(await screen.findByText('Mark')).toBeTruthy();
    expect(await screen.findByText('Baka NT')).toBeTruthy();
    expect(await screen.findByText('Luke 4')).toBeTruthy();
    expect(await screen.findByText('Peer Check')).toBeTruthy();
    expect(await screen.findByText('Apr 27, 2026')).toBeTruthy();
  });

  it('renders empty state when there are no chapters', async () => {
    useMilestoneChapters.mockReturnValue({
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
    useMilestoneChapters.mockReturnValue({
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
    fireEvent.press(await screen.findByTestId('view-project-retry'));
    expect(retry).toHaveBeenCalled();
  });
});
