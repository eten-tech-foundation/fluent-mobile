import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
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
    CloudOff: MockIcon,
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

jest.mock('../../hooks/useDraftDownload', () => ({
  useDraftDownload: () => ({
    state: {
      chapterAssignmentId: 0,
      role: 'peer_check',
      status: 'idle',
      phase: 'idle',
      progress: 0,
      readyAtMs: null,
    },
    start: jest.fn(),
    refresh: jest.fn(),
  }),
}));

const mockGetActiveUserId = jest.fn(() => '7');
const mockParseUserId = jest.fn(() => 7);
const mockGetObserverProjectIds = jest.fn(() => [] as number[]);
const mockGetTranslatorProjectIds = jest.fn(() => [] as number[]);
const mockGetObserverDraftDestination = jest.fn();
const mockIsUserProjectMember = jest.fn(
  async (_userId: number, _projectId: number): Promise<boolean> => true,
);

jest.mock('../../services/storage', () => ({
  getActiveUserId: () => mockGetActiveUserId(),
}));

jest.mock('../../utils/parseUserId', () => ({
  parseUserId: () => mockParseUserId(),
}));

jest.mock('../../services/userOrgGrants', () => ({
  hasProjectObserverGrant: () => false,
  getObserverProjectIds: () => mockGetObserverProjectIds(),
  // MyWorkRow → classifyMyWorkDraftDownloadRole may read Translator grants.
  getUserOrgGrants: () => ({ status: 'unknown' as const }),
}));

jest.mock('../../db/repository', () => ({
  isUserProjectMember: (userId: number, projectId: number) =>
    mockIsUserProjectMember(userId, projectId),
}));

jest.mock('../../utils/myWorkDraftDownload', () => {
  const actual = jest.requireActual(
    '../../utils/myWorkDraftDownload',
  ) as Record<string, unknown>;
  return {
    ...actual,
    getTranslatorProjectIds: () => mockGetTranslatorProjectIds(),
  };
});

jest.mock('../../navigation/observerDraft', () => ({
  getObserverDraftDestination: (args: {
    chapterAssignmentId: number;
    projectId: number;
  }) => mockGetObserverDraftDestination(args),
}));

const { useMyWorkChapters } = jest.requireMock(
  '../../hooks/useMyWorkChapters',
) as {
  useMyWorkChapters: jest.Mock;
};

const myWorkIds = {
  projectUnitId: 11,
  projectId: 3,
  bibleId: 5,
  bookId: 42,
  bookCode: 'LUK',
  assignedUserId: 7 as number | null,
  peerCheckerId: null as number | null,
  listAccess: 'assigned' as const,
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
  ...myWorkIds,
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
  ...myWorkIds,
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
  ...myWorkIds,
  assignedUserId: 9,
  peerCheckerId: 7,
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
  ...myWorkIds,
  listAccess: 'observer',
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
  ...myWorkIds,
  listAccess: 'observer',
};

const observerHref = {
  pathname: '/(app)/(stack)/observer-draft' as const,
  params: {
    chapterAssignmentId: '13',
    projectId: '3',
  },
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('MyWorkTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveUserId.mockReturnValue('7');
    mockParseUserId.mockReturnValue(7);
    mockGetObserverProjectIds.mockReturnValue([]);
    mockGetTranslatorProjectIds.mockReturnValue([]);
    mockGetObserverDraftDestination.mockResolvedValue(observerHref);
    mockIsUserProjectMember.mockResolvedValue(true);
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
    expect(screen.getByTestId('my-work-list-count-1')).toBeTruthy();
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
    expect(mockGetObserverDraftDestination).not.toHaveBeenCalled();
  });

  it('opens the drafter row at peer_check while their stage advance is still queued (#257)', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [
        {
          ...sampleChapter,
          assignmentStatus: 'peer_check',
          workflowStage: 'peer_check',
          syncState: 'deviceOnly',
          hasPendingStageAdvance: true,
        },
      ],
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

  it('does not open a peer_check row without a queued stage advance when the user is the drafter', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [
        {
          ...sampleChapter,
          assignmentStatus: 'peer_check',
          workflowStage: 'peer_check',
          hasPendingStageAdvance: false,
        },
      ],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-10'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes Observer rows through the guarded helper with typed IDs', async () => {
    mockGetObserverProjectIds.mockReturnValue([3]);
    useMyWorkChapters.mockReturnValue({
      chapters: [linguistChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    // Sole accordion auto-expands — do not toggle (would collapse).
    fireEvent.press(await screen.findByTestId('my-work-row-13'));

    await waitFor(() => {
      expect(mockGetObserverDraftDestination).toHaveBeenCalledWith({
        chapterAssignmentId: 13,
        projectId: 3,
      });
    });
    expect(mockPush).toHaveBeenCalledWith(observerHref);
  });

  it('does not fall back to verse-detail when Observer destination is null', async () => {
    mockGetObserverProjectIds.mockReturnValue([3]);
    mockGetObserverDraftDestination.mockResolvedValueOnce(null);
    useMyWorkChapters.mockReturnValue({
      chapters: [linguistChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-13'));

    await waitFor(() => {
      expect(mockGetObserverDraftDestination).toHaveBeenCalled();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks navigation when Observer grant is revoked before press', async () => {
    mockGetObserverProjectIds.mockReturnValue([]);
    useMyWorkChapters.mockReturnValue({
      chapters: [linguistChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-13'));

    expect(mockGetObserverDraftDestination).not.toHaveBeenCalled();
    expect(mockIsUserProjectMember).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks Observer navigation when project membership is revoked', async () => {
    mockGetObserverProjectIds.mockReturnValue([3]);
    mockIsUserProjectMember.mockResolvedValueOnce(false);
    useMyWorkChapters.mockReturnValue({
      chapters: [linguistChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-13'));

    await waitFor(() => {
      expect(mockIsUserProjectMember).toHaveBeenCalledWith(7, 3);
    });
    expect(mockGetObserverDraftDestination).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks router when membership is revoked after Observer helper resolution', async () => {
    mockGetObserverProjectIds.mockReturnValue([3]);
    const pending = deferred<typeof observerHref | null>();
    mockGetObserverDraftDestination.mockReturnValueOnce(pending.promise);
    mockIsUserProjectMember
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    useMyWorkChapters.mockReturnValue({
      chapters: [linguistChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-13'));

    await waitFor(() => {
      expect(mockGetObserverDraftDestination).toHaveBeenCalled();
    });

    await act(async () => {
      pending.resolve(observerHref);
      await pending.promise;
    });

    await waitFor(() => {
      expect(mockIsUserProjectMember).toHaveBeenCalledTimes(2);
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('routes open Peer Check rows to verse-detail when Translator grant is live', async () => {
    mockGetTranslatorProjectIds.mockReturnValue([3]);
    useMyWorkChapters.mockReturnValue({
      chapters: [
        {
          ...peerChapter,
          peerCheckerId: null,
          listAccess: 'open_peer',
        },
      ],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-12'));

    expect(mockGetObserverDraftDestination).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/(stack)/verse-detail',
      params: {
        chapterId: '12',
        chapterName: 'Luke 5',
        projectName: 'Gospel of Luke',
        language: 'Baka',
      },
    });
  });

  it('blocks open Peer Check navigation when Translator grant is revoked before press', async () => {
    mockGetTranslatorProjectIds.mockReturnValue([]);
    useMyWorkChapters.mockReturnValue({
      chapters: [
        {
          ...peerChapter,
          peerCheckerId: null,
          listAccess: 'open_peer',
        },
      ],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-12'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not route stale assigned listAccess to verse-detail without live eligibility', async () => {
    useMyWorkChapters.mockReturnValue({
      chapters: [
        {
          ...linguistChapter,
          // Stale cache claims assigned; live status/grants deny both paths.
          listAccess: 'assigned',
        },
      ],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-13'));

    expect(mockGetObserverDraftDestination).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks router when account changes after deferred Observer helper resolution', async () => {
    mockGetObserverProjectIds.mockReturnValue([3]);
    const pending = deferred<typeof observerHref | null>();
    mockGetObserverDraftDestination.mockReturnValueOnce(pending.promise);
    useMyWorkChapters.mockReturnValue({
      chapters: [linguistChapter],
      loading: false,
      refreshing: false,
      refresh: jest.fn(),
    });

    render(<MyWorkTab />);

    fireEvent.press(await screen.findByTestId('my-work-row-13'));

    await waitFor(() => {
      expect(mockGetObserverDraftDestination).toHaveBeenCalled();
    });

    mockGetActiveUserId.mockReturnValue('8');
    mockParseUserId.mockReturnValue(8);
    mockGetObserverProjectIds.mockReturnValue([]);

    await act(async () => {
      pending.resolve(observerHref);
      await pending.promise;
    });

    expect(mockPush).not.toHaveBeenCalled();
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
    expect(screen.getByTestId('my-work-list-count-1')).toBeTruthy();
    fireEvent(list, 'refresh');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
