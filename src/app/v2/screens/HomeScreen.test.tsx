import React from 'react';
import { ScrollView } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import HomeScreen from './HomeScreen';
import { hrefs } from '../../../navigation/hrefs';
import type { NextUp } from '../../../hooks/useNextUp';
import type { HomeBookSummary, MyWorkChapter } from '../../../types/db/types';
import type { SyncStatus } from '../../../utils/syncStatusState';

const mockPush = jest.fn();
const sessionDefaults = {
  refreshKey: 1,
  showLoading: false,
  isSyncingChapters: false,
  syncStatus: 'online_synced' as SyncStatus,
  failedErrorText: null as string | null,
  reauthRequired: false,
};
let mockSession = { ...sessionDefaults };
let mockChapters: MyWorkChapter[] = [];
let mockChaptersLoading = false;
const mockRefresh = jest.fn();
let mockBooks: HomeBookSummary[] = [];
let mockBooksLoading = false;
const mockRefreshBooks = jest.fn();
let mockNextUp: NextUp = { status: 'ready', hero: null, after: [] };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../../../hooks/useHaptics', () => ({
  useHaptics: () => ({ press: jest.fn() }),
}));

jest.mock('../../../navigation/AuthSessionProvider', () => ({
  useAuthSession: () => ({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
}));

jest.mock('../../../hooks/useHomeSyncState', () => ({
  useHomeSyncState: () => mockSession,
}));

jest.mock('../../../hooks/useActiveAccountSummary', () => ({
  useActiveAccountSummary: () => ({
    activeUserId: '7',
    email: 'jordan@example.org',
    firstName: 'Jordan',
    lastName: 'Smith',
    accountCount: 1,
  }),
}));

jest.mock('./home/AccountsSheet', () => ({
  AccountsSheet: ({
    visible,
    onClose,
  }: {
    visible: boolean;
    onClose: () => void;
  }) => {
    const { Pressable } = require('react-native');
    return visible ? (
      <Pressable testID="accounts-sheet" onPress={onClose} />
    ) : null;
  },
}));

let mockChangesPreview = false;
jest.mock('../../../config/devPreviewChangesRequested', () => ({
  isDevPreviewChangesRequestedEnabled: () => mockChangesPreview,
}));

jest.mock('../../../hooks/useNextUp', () => ({
  ...jest.requireActual('../../../hooks/useNextUp'),
  useNextUp: () => mockNextUp,
}));

jest.mock('../../../hooks/useMyWorkChapters', () => ({
  useMyWorkChapters: () => ({
    chapters: mockChapters,
    loading: mockChaptersLoading,
    refreshing: false,
    refresh: mockRefresh,
  }),
}));

jest.mock('../../../hooks/useHomeBooks', () => ({
  useHomeBooks: () => ({
    books: mockBooks,
    loading: mockBooksLoading,
    refresh: mockRefreshBooks,
  }),
}));

function chapter(id: number, bookName: string, chapterNumber: number) {
  return {
    id,
    displayLabel: `${bookName} ${chapterNumber}`,
    bookName,
    chapterNumber,
    workflowStage: 'draft',
    ownershipState: 'mine',
    completedVerses: 0,
    totalVerses: 20,
    projectId: 9,
    projectUnitId: 3,
    projectName: 'Mark Telugu',
    milestoneName: 'Gospels Phase 1',
    targetLanguageName: 'Telugu',
  } as MyWorkChapter;
}

const MARK: HomeBookSummary = {
  key: '3:41',
  bookId: 41,
  bookName: 'Mark',
  projectId: 9,
  projectUnitId: 3,
  projectName: 'Mark Telugu',
  milestoneName: 'Gospels Phase 1',
  targetLanguageName: 'Telugu',
  firstChapterId: 21,
  mine: 2,
  withOthers: 1,
  open: 13,
  complete: 0,
  totalChapters: 16,
  recordedChapters: 1,
  checkedChapters: 0,
};

describe('Next HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { ...sessionDefaults };
    mockChapters = [chapter(1, 'Mark', 14), chapter(2, 'Mark', 15)];
    mockChaptersLoading = false;
    mockBooks = [MARK];
    mockBooksLoading = false;
    mockNextUp = { status: 'ready', hero: null, after: [] };
    mockChangesPreview = false;
  });

  it('shows the account, the sync status and a chapter summary', () => {
    render(<HomeScreen />);

    expect(screen.getByRole('header', { name: 'My work' })).toBeTruthy();
    expect(screen.getByText('JS')).toBeTruthy();
    expect(screen.getByTestId('home-summary').props.children).toBe(
      '2 chapters · All synced',
    );
    expect(
      screen.getByRole('button', {
        name: 'Online · all synced. Open Sync page.',
      }),
    ).toBeTruthy();
  });

  it('opens accounts from the avatar, while the cloud does nothing yet', () => {
    render(<HomeScreen />);
    expect(screen.queryByTestId('accounts-sheet')).toBeNull();

    fireEvent.press(
      screen.getByRole('button', { name: 'Jordan Smith. Accounts' }),
    );
    fireEvent.press(screen.getByTestId('accounts-sheet'));
    expect(screen.queryByTestId('accounts-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('home-sync'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('asks to sign in again when the session expired', () => {
    mockSession = { ...sessionDefaults, reauthRequired: true };
    render(<HomeScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockPush).toHaveBeenCalledWith(hrefs.reauth({ returnTo: 'home' }));
  });

  it('shows the syncing state until the first sync settles', () => {
    mockSession = { ...sessionDefaults, showLoading: true };
    render(<HomeScreen />);

    expect(screen.getByTestId('home-loading')).toBeTruthy();
    expect(screen.queryByText('My work')).toBeNull();
  });

  it('shows the empty message when no milestone has chapters', () => {
    mockChapters = [];
    mockBooks = [];
    render(<HomeScreen />);

    expect(screen.getByTestId('home-empty')).toBeTruthy();
    expect(screen.getByTestId('home-summary').props.children).toBe(
      '0 chapters · All synced',
    );
  });

  it('points to the books when nothing is mine yet', () => {
    mockChapters = [];
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-empty')).toBeNull();
    expect(screen.getByTestId('home-next-up-empty')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Books' })).toBeTruthy();
  });

  it('waits for the books before showing anything', () => {
    mockBooksLoading = true;
    render(<HomeScreen />);

    expect(screen.getByTestId('home-chapters-loading')).toBeTruthy();
    expect(screen.queryByText('Next up')).toBeNull();
  });

  it('waits on chapters while a sync is still bringing them in', () => {
    mockChapters = [];
    mockSession = { ...sessionDefaults, isSyncingChapters: true };
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-empty')).toBeNull();
    expect(screen.getByTestId('home-chapters-loading')).toBeTruthy();
    expect(screen.getByTestId('home-summary').props.children).toBe(
      'All synced',
    );
  });

  it('re-reads the chapters and books on pull to refresh, spinning until both land', async () => {
    let finishBooks!: () => void;
    mockRefresh.mockResolvedValue(undefined);
    mockRefreshBooks.mockReturnValue(
      new Promise<void>(resolve => {
        finishBooks = resolve;
      }),
    );
    render(<HomeScreen />);
    const refreshControl = () =>
      screen.UNSAFE_getByType(ScrollView).props.refreshControl.props;

    act(() => {
      void refreshControl().onRefresh();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshBooks).toHaveBeenCalledTimes(1);
    expect(refreshControl().refreshing).toBe(true);

    await act(async () => {
      finishBooks();
    });
    expect(refreshControl().refreshing).toBe(false);
  });

  describe('Next up', () => {
    beforeEach(() => {
      const mark14 = chapter(1, 'Mark', 14);
      mockNextUp = {
        status: 'ready',
        hero: {
          key: '1:pericope::2',
          chapter: mark14,
          passage: {
            key: 'pericope::2',
            title: 'The Last Supper',
            reference: 'Mark 14:22–25',
            verses: '22–25',
            anchorVerse: 22,
            recordedStatus: 'partial',
            recordedVerses: 2,
            totalVerses: 4,
            submitted: false,
            peerChecked: false,
            seed: 'Mark:pericope::2',
            groupSeed: 'Mark:14',
          },
        },
        after: [],
      };
    });

    it('opens the passage to record next on its passage page', () => {
      render(<HomeScreen />);

      expect(screen.getByRole('header', { name: 'Next up' })).toBeTruthy();
      fireEvent.press(
        screen.getByRole('button', {
          name: 'The Last Supper, Mark 14:22–25, Draft · Gospels Phase 1. Keep recording.',
        }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        hrefs.passage({
          chapterId: 1,
          anchorVerse: 22,
          projectId: 9,
          projectUnitId: 3,
          chapterName: 'Mark 14',
          projectName: 'Mark Telugu',
          milestoneName: 'Gospels Phase 1',
          language: 'Telugu',
        }),
      );
    });
  });

  describe('Changes requested', () => {
    it('opens the passage to re-record', () => {
      mockChangesPreview = true;
      render(<HomeScreen />);

      fireEvent.press(
        screen.getByRole('button', {
          name: 'Changes requested. Ravi left 3 notes on your Mark 14. Make changes.',
        }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        hrefs.passage({
          chapterId: 1,
          anchorVerse: 1,
          projectId: 9,
          projectUnitId: 3,
          chapterName: 'Mark 14',
          projectName: 'Mark Telugu',
          milestoneName: 'Gospels Phase 1',
          language: 'Telugu',
        }),
      );
    });

    it('is not on Home without the dev preview', () => {
      render(<HomeScreen />);

      expect(screen.queryByTestId('home-changes-requested')).toBeNull();
    });
  });

  it('lists the books and opens one at its first chapter', () => {
    render(<HomeScreen />);

    expect(screen.getByRole('header', { name: 'Books' })).toBeTruthy();
    fireEvent.press(
      screen.getByRole('button', {
        name: 'Mark, Gospels Phase 1 · 2 yours · 1 with others · 13 open, 1 of 16 chapters recorded. Open book page.',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      hrefs.chapters({
        projectId: 9,
        projectUnitId: 3,
        projectName: 'Mark Telugu',
        milestoneName: 'Gospels Phase 1',
        language: 'Telugu',
        focusChapterId: 21,
      }),
    );
  });
});
