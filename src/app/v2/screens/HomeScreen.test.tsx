import React from 'react';
import { ScrollView } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
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
let mockBooksError = false;
let mockChaptersError = false;
let mockChaptersReading = false;
let mockBooksReading = false;
const mockRefreshBooks = jest.fn();
let mockNextUp: NextUp = {
  status: 'ready',
  hero: null,
  after: [],
  checking: [],
};

let mockIsFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useIsFocused: () => mockIsFocused,
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
    activeUserId: mockActiveUserId,
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

const observerHref = {
  pathname: '/(app)/(stack)/observer-draft',
  params: { chapterAssignmentId: '1', projectId: '9' },
};
let mockOpen: unknown = { kind: 'work' };
jest.mock('../../../navigation/chapterOpen', () => ({
  resolveChapterOpen: async () => mockOpen,
}));

let mockActiveUserId: string | null = '7';

const mockHideSplash = jest.fn();
jest.mock('../../../navigation/splashGate', () => ({
  hideSplash: (...args: unknown[]) => mockHideSplash(...args),
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
    error: mockChaptersError,
    reading: mockChaptersReading,
  }),
}));

jest.mock('../../../hooks/useHomeBooks', () => ({
  useHomeBooks: () => ({
    books: mockBooks,
    loading: mockBooksLoading,
    error: mockBooksError,
    reading: mockBooksReading,
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
  pendingUploads: 0,
};

type Rendered = ReturnType<typeof screen.toJSON> | string;

function testIdsInOrder(node: Rendered): string[] {
  if (!node || typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap(testIdsInOrder);
  const own = typeof node.props.testID === 'string' ? [node.props.testID] : [];
  return [...own, ...(node.children ?? []).flatMap(testIdsInOrder)];
}

describe('Next HomeScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { ...sessionDefaults };
    mockChapters = [chapter(1, 'Mark', 14), chapter(2, 'Mark', 15)];
    mockChaptersLoading = false;
    mockBooks = [MARK];
    mockBooksLoading = false;
    mockBooksError = false;
    mockChaptersError = false;
    mockChaptersReading = false;
    mockBooksReading = false;
    mockNextUp = { status: 'ready', hero: null, after: [], checking: [] };
    mockChangesPreview = false;
    mockOpen = { kind: 'work' };
    mockActiveUserId = '7';
    mockIsFocused = true;
  });

  it('shows the account, the sync status and a chapter summary', () => {
    render(<HomeScreen />);

    expect(screen.getByRole('header', { name: 'My work' })).toBeTruthy();
    expect(screen.getByText('JS')).toBeTruthy();
    expect(screen.getByTestId('home-summary').props.children).toBe(
      '2 chapters',
    );
    expect(
      screen.getByLabelText('Online · all synced. Open Sync page.'),
    ).toBeTruthy();
  });

  it('says checking, not offline, before reachability is known', () => {
    mockSession = { ...sessionDefaults, syncStatus: 'checking' };
    render(<HomeScreen />);

    expect(screen.getByTestId('home-summary').props.children).toBe(
      '2 chapters',
    );
    expect(
      screen.getByLabelText('Checking connection. Open Sync page.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Offline/)).toBeNull();
    // Saved content is not held back while it checks.
    expect(screen.getByTestId('home-books')).toBeTruthy();
  });

  it('still shows a confirmed offline', () => {
    mockSession = { ...sessionDefaults, syncStatus: 'offline_pending' };
    render(<HomeScreen />);

    expect(
      screen.getByLabelText('Offline · upload pending. Open Sync page.'),
    ).toBeTruthy();
  });

  it('opens accounts from the avatar and the Sync page from the cloud', () => {
    render(<HomeScreen />);
    expect(screen.queryByTestId('accounts-sheet')).toBeNull();

    fireEvent.press(
      screen.getByRole('button', { name: 'Jordan Smith. Accounts' }),
    );
    fireEvent.press(screen.getByTestId('accounts-sheet'));
    expect(screen.queryByTestId('accounts-sheet')).toBeNull();

    fireEvent.press(screen.getByTestId('home-sync'));
    fireEvent.press(screen.getByTestId('home-sync'));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(hrefs.sync);
  });

  it('keeps the header above My work and strokes it once the page scrolls', () => {
    jest.useFakeTimers();
    render(<HomeScreen />);
    const scroll = screen.getByTestId('home-scroll');
    expect(within(scroll).queryByTestId('home-sync')).toBeNull();
    const stroke = screen.getByTestId('home-header-stroke');
    expect(stroke).toHaveAnimatedStyle({ opacity: 0 });

    fireEvent.scroll(scroll, {
      nativeEvent: { contentOffset: { x: 0, y: 80 } },
    });
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(stroke).toHaveAnimatedStyle({ opacity: 1 });
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
    expect(screen.getByTestId('home-sync')).toBeTruthy();
    expect(screen.getByText('My work')).toBeTruthy();
  });

  it('shows the empty message when no milestone has chapters', () => {
    mockChapters = [];
    mockBooks = [];
    render(<HomeScreen />);

    expect(screen.getByTestId('home-empty')).toBeTruthy();
    expect(screen.getByTestId('home-summary').props.children).toBe(
      '0 chapters',
    );
  });

  describe('cold-start splash', () => {
    const layout = () =>
      fireEvent(screen.getByTestId('home-body'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 100 } },
      });

    it('comes down once the content is laid out', () => {
      render(<HomeScreen />);
      layout();

      expect(mockHideSplash).toHaveBeenCalledWith('home:content');
    });

    it('comes down for the empty message too', () => {
      mockChapters = [];
      mockBooks = [];
      render(<HomeScreen />);
      layout();

      expect(mockHideSplash).toHaveBeenCalledWith('home:empty');
    });

    it('comes down for the failed-read message too', () => {
      mockChapters = [];
      mockBooks = [];
      mockBooksError = true;
      render(<HomeScreen />);
      layout();

      expect(mockHideSplash).toHaveBeenCalledWith('home:error');
    });

    it('stays up while the lists are still being read', () => {
      mockBooksLoading = true;
      render(<HomeScreen />);
      layout();

      expect(screen.getByTestId('home-chapters-loading')).toBeTruthy();
      expect(mockHideSplash).not.toHaveBeenCalled();
    });

    it('comes down for the spinner of a launch-time sync with nothing saved', () => {
      mockChapters = [];
      mockBooks = [];
      mockSession = { ...sessionDefaults, isSyncingChapters: true };
      render(<HomeScreen />);
      layout();

      expect(screen.getByTestId('home-chapters-loading')).toBeTruthy();
      expect(mockHideSplash).toHaveBeenCalledWith('home:syncing');
    });

    it('comes down when a screen is pushed over Home before its lists land', () => {
      mockBooksLoading = true;
      mockNextUp = { status: 'loading' };
      mockIsFocused = false;
      render(<HomeScreen />);

      expect(mockHideSplash).toHaveBeenCalledWith('home:blurred');
    });

    it('leaves the splash to Home while it is focused and still reading', () => {
      mockBooksLoading = true;
      mockNextUp = { status: 'loading' };
      render(<HomeScreen />);

      expect(mockHideSplash).not.toHaveBeenCalled();
    });
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

  it('holds the first paint until Next up lands, then shows Books before it', () => {
    mockChapters = [chapter(1, 'Mark', 14)];
    mockNextUp = { status: 'loading' };
    render(<HomeScreen />);

    // Chapters and books are read, but Home waits for the hero so it
    // appears complete at once rather than Books first and the hero later.
    expect(screen.getByTestId('home-chapters-loading')).toBeTruthy();
    expect(screen.queryByTestId('home-books')).toBeNull();
    expect(screen.queryByTestId('home-next-up')).toBeNull();

    mockNextUp = {
      status: 'ready',
      hero: {
        key: '1:chapter:14',
        chapter: mockChapters[0],
        passage: {
          key: 'chapter:14',
          title: null,
          reference: 'Mark 14',
          verses: '1–72',
          anchorVerse: 1,
          recordedStatus: 'none',
          recordedVerses: 0,
          totalVerses: 72,
          submitted: false,
          peerChecked: false,
          seed: 'Mark:chapter:14',
          groupSeed: 'Mark:14',
        },
      },
      after: [],
      checking: [],
    };
    screen.rerender(<HomeScreen />);

    expect(screen.getByTestId('home-next-up-hero')).toBeTruthy();
    expect(screen.queryByText('Then')).toBeNull();
    // Books ahead of Next up in the scroll content.
    const order = testIdsInOrder(screen.toJSON());
    expect(order.indexOf('home-books')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('home-books')).toBeLessThan(
      order.indexOf('home-next-up'),
    );
  });

  it('keeps Books on screen when Next up reloads later', () => {
    mockChapters = [chapter(1, 'Mark', 14)];
    render(<HomeScreen />);
    const booksBefore = screen.getByTestId('home-books');

    // e.g. the drafting unit changed: Next up goes back to loading.
    mockNextUp = { status: 'loading' };
    screen.rerender(<HomeScreen />);

    expect(screen.queryByTestId('home-chapters-loading')).toBeNull();
    expect(screen.getByTestId('home-books')).toBe(booksBefore);
    expect(screen.queryByTestId('home-next-up')).toBeNull();
  });

  it("doesn't wait on Next up when there are no chapters to draft", () => {
    mockChapters = [];
    mockNextUp = { status: 'loading' };
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-chapters-loading')).toBeNull();
    expect(screen.getByRole('header', { name: 'Books' })).toBeTruthy();
  });

  it('holds the spinner instead of the empty message while the post-sync read is in flight', () => {
    mockChapters = [];
    mockBooks = [];
    mockChaptersReading = true;
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-empty')).toBeNull();
    expect(screen.getByTestId('home-chapters-loading')).toBeTruthy();

    mockChaptersReading = false;
    screen.rerender(<HomeScreen />);

    expect(screen.getByTestId('home-empty')).toBeTruthy();
  });

  it('says the chapters read failed when there is nothing saved to show', () => {
    mockChapters = [];
    mockBooks = [];
    mockChaptersError = true;
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-empty')).toBeNull();
    expect(screen.getByTestId('home-error')).toBeTruthy();
  });

  it('says the reads failed, with a retry, when there is nothing saved to show', () => {
    mockChapters = [];
    mockBooks = [];
    mockBooksError = true;
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-empty')).toBeNull();
    expect(screen.getByTestId('home-error')).toBeTruthy();

    fireEvent.press(screen.getByTestId('home-retry'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshBooks).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved books when a later read fails', () => {
    mockBooksError = true;
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-error')).toBeNull();
    expect(screen.getByRole('header', { name: 'Books' })).toBeTruthy();
  });

  it('keeps Next up and Books showing while they reload after a sync', () => {
    render(<HomeScreen />);
    expect(screen.getByRole('header', { name: 'Books' })).toBeTruthy();

    mockChaptersLoading = true;
    mockBooksLoading = true;
    screen.rerender(<HomeScreen />);

    expect(screen.queryByTestId('home-chapters-loading')).toBeNull();
    expect(screen.getByRole('header', { name: 'Next up' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Books' })).toBeTruthy();
  });

  it('keeps the books on screen through a sync when none of the chapters are mine', () => {
    mockChapters = [];
    mockSession = { ...sessionDefaults, isSyncingChapters: true };
    render(<HomeScreen />);

    expect(screen.queryByTestId('home-chapters-loading')).toBeNull();
    expect(screen.getByRole('header', { name: 'Books' })).toBeTruthy();
  });

  it('waits on chapters while a sync is still bringing them in', () => {
    mockChapters = [];
    mockBooks = [];
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
        checking: [],
      };
    });

    it('opens the passage to record next on its passage page', async () => {
      render(<HomeScreen />);

      expect(screen.getByRole('header', { name: 'Next up' })).toBeTruthy();
      await act(async () => {
        fireEvent.press(
          screen.getByRole('button', {
            name: 'The Last Supper, Mark 14:22–25, Draft · Gospels Phase 1. Keep recording.',
          }),
        );
      });
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

    it('sends an observer to the read-only view, never the passage', async () => {
      mockOpen = { kind: 'observer', href: observerHref };
      render(<HomeScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('home-next-up-hero'));
      });
      expect(mockPush).toHaveBeenCalledWith(observerHref);
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("doesn't open anything when the access check stops it", async () => {
      mockOpen = null;
      render(<HomeScreen />);

      await act(async () => {
        fireEvent.press(screen.getByTestId('home-next-up-hero'));
      });
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('lists the chapters I check or observe after the passages', () => {
      const peer = {
        ...chapter(2, 'Mark', 15),
        workflowStage: 'peer_check',
        listAccess: 'open_peer',
      } as MyWorkChapter;
      mockNextUp = {
        ...mockNextUp,
        checking: [
          {
            key: '2:chapter:2',
            chapter: peer,
            passage: {
              key: 'chapter:2',
              title: null,
              reference: 'Mark 15',
              verses: '1–20',
              anchorVerse: 1,
              recordedStatus: 'none',
              recordedVerses: 0,
              totalVerses: 20,
              submitted: true,
              peerChecked: false,
              seed: 'Mark:15:chapter',
              groupSeed: 'Mark:15',
            },
          },
        ],
      } as NextUp;
      render(<HomeScreen />);

      expect(screen.getByTestId('home-checking')).toBeTruthy();
      expect(
        screen.getByText('Open peer check · Gospels Phase 1', {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
    });
  });

  it('keeps accounts and settings reachable without an account summary', () => {
    mockActiveUserId = null;
    render(<HomeScreen />);

    fireEvent.press(
      screen.getByRole('button', { name: 'Accounts and settings' }),
    );
    expect(screen.getByTestId('accounts-sheet')).toBeTruthy();
  });

  describe('Changes requested', () => {
    it('opens the passage to re-record', async () => {
      mockChangesPreview = true;
      render(<HomeScreen />);

      await act(async () => {
        fireEvent.press(
          screen.getByRole('button', {
            name: 'Changes requested. Ravi left 3 notes on your Mark 14. Make changes.',
          }),
        );
      });
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
