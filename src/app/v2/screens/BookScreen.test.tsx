import React from 'react';
import { FlatList } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import BookScreen from './BookScreen';
import { PROJECT_CHAPTERS_EMPTY_MESSAGE } from '../../../constants/messages';
import type { BookPassage, BookPassages } from '../../../hooks/useBookPassages';
import { hrefs } from '../../../navigation/hrefs';
import type { ProjectChapter } from '../../../types/db/types';
import { lastFlatListProps } from '../../../test/flatListCapture';

jest.mock('react-native/Libraries/Lists/FlatList', () => ({
  __esModule: true,
  default: require('../../../test/flatListCapture').CapturingFlatList,
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRetry = jest.fn();
let mockChapters: ProjectChapter[] = [];
let mockLoadState = { loading: false, error: null as unknown, removed: false };
let mockPassages: BookPassages = { status: 'loading' };
const baseParams = {
  projectId: '9',
  projectUnitId: '3',
  projectName: 'Mark Telugu',
  milestoneName: 'Gospels Phase 1',
  language: 'Telugu',
};
let mockParams: Record<string, string> = { ...baseParams };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
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

const observerHref = {
  pathname: '/(app)/(stack)/observer-draft',
  params: { chapterAssignmentId: '1', projectId: '9' },
};
let mockOpen: unknown = { kind: 'work' };
jest.mock('../../../navigation/chapterOpen', () => ({
  resolveAssignmentOpen: async () => mockOpen,
}));

const mockOpenSync = jest.fn();
jest.mock('../../../hooks/useHeaderSync', () => ({
  useHeaderSync: () => ({
    status: 'online_pending',
    failedErrorText: null,
    openSync: mockOpenSync,
  }),
}));

jest.mock('../../../hooks/useMilestoneChapters', () => ({
  useMilestoneChapters: () => ({
    chapters: mockChapters,
    loading: mockLoadState.loading,
    refreshing: false,
    error: mockLoadState.error,
    removedFromProject: mockLoadState.removed,
    refresh: jest.fn(),
    retry: mockRetry,
    reload: jest.fn(),
  }),
}));

jest.mock('../../../hooks/useBookPassages', () => ({
  useBookPassages: () => mockPassages,
}));

function chapter(id: number, chapterNumber: number, bookName = 'Mark') {
  return {
    id,
    displayLabel: `${bookName} ${chapterNumber}`,
    bookName,
    chapterNumber,
  } as ProjectChapter;
}

function art(key: string, recordedVerses: number, totalVerses: number) {
  return {
    recordedVerses,
    totalVerses,
    submitted: false,
    peerChecked: false,
    seed: `Mark:${key}`,
    groupSeed: 'Mark',
  };
}

describe('BookScreen', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpen = { kind: 'work' };
    mockParams = { ...baseParams };
    mockLoadState = { loading: false, error: null, removed: false };
    mockChapters = [chapter(1, 14), chapter(2, 15)];
    mockPassages = {
      status: 'ready',
      byChapter: new Map([
        [
          1,
          [
            {
              key: 'pericope::1',
              title: 'The Last Supper',
              reference: 'Mark 14:22–25',
              verses: '22–25',
              anchorVerse: 22,
              recordedStatus: 'recorded',
              ...art('pericope::1', 4, 4),
            },
            {
              key: 'pericope::2',
              title: null,
              reference: 'Mark 14:26–31',
              verses: '26–31',
              anchorVerse: 26,
              recordedStatus: 'none',
              ...art('pericope::2', 0, 6),
            },
          ],
        ],
        [
          2,
          [
            {
              key: 'pericope::3',
              title: 'Jesus Before Pilate',
              reference: 'Mark 15:1–5',
              verses: '1–5',
              anchorVerse: 1,
              recordedStatus: 'partial',
              ...art('pericope::3', 2, 5),
            },
          ],
        ],
      ]),
      pericopes: true,
    };
  });

  it('names the book and groups passages under their chapters', async () => {
    await render(<BookScreen />);

    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.getByText('Chapter 14')).toBeTruthy();
    expect(screen.queryByText('1 of 2 recorded')).toBeNull();
    expect(screen.getByText('Chapter 15')).toBeTruthy();
    expect(screen.getByText('1 of 3 pericopes recorded')).toBeTruthy();
    expect(
      screen.getByLabelText('The Last Supper, Mark 14:22–25, Recorded'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Mark 14:26–31, Not recorded yet'),
    ).toBeTruthy();
    expect(screen.queryByText('Mark 14:26–31')).toBeNull();
    expect(screen.queryByText('Not recorded yet')).toBeNull();
  });

  it('shows the sync status and opens Sync, like Legacy drafting', async () => {
    await render(<BookScreen />);

    const cloud = screen.getByTestId('book-sync');
    expect(cloud.props.accessibilityLabel).toMatch(/pending/i);
    await fireEvent.press(cloud);
    expect(mockOpenSync).toHaveBeenCalledTimes(1);
  });

  it('says when a passage is in peer check', async () => {
    mockChapters = [chapter(1, 14)];
    mockPassages = {
      status: 'ready',
      byChapter: new Map([
        [
          1,
          [
            {
              key: 'pericope::1',
              title: 'The Last Supper',
              reference: 'Mark 14:22–25',
              verses: '22–25',
              anchorVerse: 22,
              recordedStatus: 'recorded',
              ...art('pericope::1', 4, 4),
              submitted: true,
            },
          ],
        ],
      ]),
      pericopes: true,
    };

    await render(<BookScreen />);

    expect(
      screen.getByLabelText('The Last Supper, Mark 14:22–25, In peer check'),
    ).toBeTruthy();
  });

  it('uses the milestone name when it spans books', async () => {
    mockChapters = [chapter(1, 14), chapter(2, 1, 'Luke')];

    await render(<BookScreen />);

    expect(screen.getByText('Gospels Phase 1')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Mark 14' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Luke 1' })).toBeTruthy();
  });

  it('counts passages across books, and one crossing chapters once', async () => {
    const passage = (key: string, recordedVerses: number): BookPassage => ({
      key,
      title: null,
      reference: key,
      verses: '1–4',
      anchorVerse: 1,
      recordedStatus: recordedVerses > 0 ? 'recorded' : 'none',
      ...art(key, recordedVerses, 4),
    });
    mockChapters = [
      chapter(1, 1, 'Genesis'),
      chapter(2, 2, 'Genesis'),
      chapter(3, 1, 'Exodus'),
    ];
    mockPassages = {
      status: 'ready',
      // Pericope numbers restart in each book; Genesis 1–2 shares one.
      byChapter: new Map([
        [1, [passage('pericope::1', 4)]],
        [2, [passage('pericope::1', 4)]],
        [3, [passage('pericope::1', 0)]],
      ]),
      pericopes: true,
    };

    await render(<BookScreen />);

    expect(screen.getByText('1 of 2 pericopes recorded')).toBeTruthy();
  });

  it('counts chapters when the project has no pericopes', async () => {
    const whole = (id: number, recordedVerses: number): BookPassage => ({
      key: `chapter:${id}`,
      title: null,
      reference: `Mark ${id}`,
      verses: '1–4',
      anchorVerse: 1,
      recordedStatus: recordedVerses > 0 ? 'recorded' : 'none',
      ...art(`${id}:chapter`, recordedVerses, 4),
    });
    mockPassages = {
      status: 'ready',
      byChapter: new Map([
        [1, [whole(1, 4)]],
        [2, [whole(2, 0)]],
      ]),
      pericopes: false,
    };

    await render(<BookScreen />);

    expect(screen.getByText('1 of 2 chapters recorded')).toBeTruthy();
  });

  it('says each chapter’s stage, whose it is, and what has to sync', async () => {
    mockChapters = [
      {
        ...chapter(1, 14),
        workflowStage: 'community_review',
        ownershipState: 'other',
        syncState: 'deviceOnly',
        hasConflict: false,
      },
      {
        ...chapter(2, 15),
        workflowStage: 'draft',
        ownershipState: 'mine',
        syncState: 'synced',
        hasConflict: true,
      },
    ];
    await render(<BookScreen />);

    expect(screen.getByTestId('book-chapter-1-meta').props.children).toBe(
      "Community Check · Someone else's · Upload pending",
    );
    expect(screen.getByTestId('book-chapter-2-meta').props.children).toBe(
      'Draft · Yours · Sync conflict',
    );
  });

  it('shows a waiting send on its covers', async () => {
    mockChapters = [chapter(1, 14)];
    mockPassages = {
      status: 'ready',
      byChapter: new Map([
        [
          1,
          [
            {
              key: 'pericope::1',
              title: 'The Last Supper',
              reference: 'Mark 14:22–25',
              verses: '22–25',
              anchorVerse: 22,
              recordedStatus: 'recorded',
              ...art('pericope::1', 4, 4),
              waitingToSend: true,
            },
          ],
        ],
      ]),
      pericopes: true,
    };
    await render(<BookScreen />);

    expect(
      screen.getByLabelText('The Last Supper, Mark 14:22–25, Waiting to send'),
    ).toBeTruthy();
  });

  it('sends an observer to the read-only view, never the passage', async () => {
    mockOpen = { kind: 'observer', href: observerHref };
    await render(<BookScreen />);

    await act(async () => {
      await fireEvent.press(screen.getByTestId('book-passage-1-pericope::1'));
    });

    expect(mockPush).toHaveBeenCalledWith(observerHref);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('opens the passage page for the passage, marked as from the book', async () => {
    await render(<BookScreen />);

    await act(async () => {
      await fireEvent.press(screen.getByTestId('book-passage-1-pericope::1'));
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
        from: 'book',
      }),
    );
  });

  describe('focus chapter', () => {
    let scrollToIndex: jest.SpyInstance;
    let scrollToOffset: jest.SpyInstance;

    beforeEach(() => {
      scrollToIndex = jest
        .spyOn(FlatList.prototype, 'scrollToIndex')
        .mockImplementation(() => undefined);
      scrollToOffset = jest
        .spyOn(FlatList.prototype, 'scrollToOffset')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      scrollToIndex.mockRestore();
      scrollToOffset.mockRestore();
      jest.useRealTimers();
    });

    it("scrolls to the chapter once that chapter's covers load", async () => {
      const loaded = mockPassages;
      mockParams = { ...baseParams, focusChapterId: '2' };
      mockPassages = { status: 'loading' };
      const { rerender } = await render(<BookScreen />);
      expect(scrollToIndex).not.toHaveBeenCalled();

      // Settled for no chapters yet, before the milestone's arrive.
      mockPassages = { status: 'ready', byChapter: new Map(), pericopes: true };
      await rerender(<BookScreen />);
      expect(scrollToIndex).not.toHaveBeenCalled();

      mockPassages = loaded;
      await rerender(<BookScreen />);
      await rerender(<BookScreen />);

      expect(scrollToIndex).toHaveBeenCalledTimes(1);
      expect(scrollToIndex).toHaveBeenCalledWith({
        index: 1,
        viewPosition: 0,
        animated: false,
      });
    });

    it('waits to scroll until the list is shown, even if the focused chapter already has covers', async () => {
      const loaded = mockPassages;
      if (loaded.status !== 'ready') throw new Error('expected ready passages');
      mockParams = { ...baseParams, focusChapterId: '2' };
      mockPassages = {
        status: 'ready',
        byChapter: new Map([[2, loaded.byChapter.get(2) ?? []]]),
        pericopes: true,
      };
      const { rerender } = await render(<BookScreen />);
      expect(screen.queryByTestId('book-list')).toBeNull();
      expect(scrollToIndex).not.toHaveBeenCalled();

      mockPassages = loaded;
      await rerender(<BookScreen />);

      expect(screen.getByTestId('book-list')).toBeTruthy();
      expect(scrollToIndex).toHaveBeenCalledTimes(1);
      expect(scrollToIndex).toHaveBeenCalledWith({
        index: 1,
        viewPosition: 0,
        animated: false,
      });
    });

    it('starts at the top without a chapter, with one it does not have, or at the first', async () => {
      await render(<BookScreen />);
      mockParams = { ...baseParams, focusChapterId: '99' };
      await render(<BookScreen />);
      mockParams = { ...baseParams, focusChapterId: '1' };
      await render(<BookScreen />);

      expect(scrollToIndex).not.toHaveBeenCalled();
    });

    it('jumps near a chapter it has not laid out yet, retrying up to three times', async () => {
      jest.useFakeTimers();
      mockParams = { ...baseParams, focusChapterId: '2' };
      await render(<BookScreen />);
      scrollToIndex.mockClear();
      const failed = {
        index: 1,
        highestMeasuredFrameIndex: 0,
        averageItemLength: 300,
      };

      await act(() => lastFlatListProps().onScrollToIndexFailed?.(failed));
      expect(scrollToOffset).toHaveBeenCalledWith({
        offset: 300,
        animated: false,
      });
      await act(() => jest.advanceTimersByTime(100));
      expect(scrollToIndex).toHaveBeenCalledTimes(1);

      for (let miss = 0; miss < 3; miss += 1) {
        await act(() => lastFlatListProps().onScrollToIndexFailed?.(failed));
        await act(() => jest.advanceTimersByTime(100));
      }
      expect(scrollToIndex).toHaveBeenCalledTimes(3);
      expect(scrollToOffset).toHaveBeenCalledTimes(4);
    });
  });

  it('shows a spinner on the first load only, keeping the list on a reload', async () => {
    mockLoadState = { loading: true, error: null, removed: false };
    mockChapters = [];
    const { rerender } = await render(<BookScreen />);
    expect(screen.queryByText('Chapter 14')).toBeNull();

    mockChapters = [chapter(1, 14), chapter(2, 15)];
    await rerender(<BookScreen />);
    expect(screen.getByText('Chapter 14')).toBeTruthy();
  });

  it('shows the spinner, not the list, while chapters are ready and passages are loading', async () => {
    mockPassages = { status: 'loading' };
    await render(<BookScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeTruthy();
    expect(screen.queryByTestId('book-list')).toBeNull();
    expect(screen.queryByText('Mark')).toBeNull();
    expect(screen.queryByText('Chapter 14')).toBeNull();
  });

  it('holds the spinner until covers exist for the chapters', async () => {
    mockPassages = { status: 'ready', byChapter: new Map(), pericopes: true };
    await render(<BookScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeTruthy();
    expect(screen.queryByTestId('book-list')).toBeNull();
  });

  it('shows the list and the book name together once passages are ready', async () => {
    const loaded = mockPassages;
    mockPassages = { status: 'loading' };
    const { rerender } = await render(<BookScreen />);
    expect(screen.queryByTestId('book-list')).toBeNull();

    mockPassages = loaded;
    await rerender(<BookScreen />);

    expect(screen.getByTestId('book-list')).toBeTruthy();
    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.getByTestId('book-passage-1-pericope::1')).toBeTruthy();
  });

  it('keeps the list mounted on a later focus when passages stay ready', async () => {
    const { rerender } = await render(<BookScreen />);
    expect(screen.getByTestId('book-list')).toBeTruthy();

    await rerender(<BookScreen />);

    expect(screen.getByTestId('book-list')).toBeTruthy();
    expect(screen.getByText('Mark')).toBeTruthy();
  });

  it('keeps the list when coming back even if passages load again', async () => {
    const { rerender } = await render(<BookScreen />);
    expect(screen.getByTestId('book-list')).toBeTruthy();

    mockPassages = { status: 'loading' };
    await rerender(<BookScreen />);

    expect(screen.getByTestId('book-list')).toBeTruthy();
    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.getByText('Chapter 14')).toBeTruthy();
  });

  it('offers a retry when the chapters fail to load', async () => {
    mockLoadState = {
      loading: false,
      error: new Error('nope'),
      removed: false,
    };

    await render(<BookScreen />);

    expect(screen.getByText('Unable to load this project.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('book-retry'));

    expect(mockRetry).toHaveBeenCalled();
  });

  it('shows the empty message when the milestone has no chapters', async () => {
    mockChapters = [];

    await render(<BookScreen />);

    expect(screen.getByText(PROJECT_CHAPTERS_EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByTestId('book-list')).toBeNull();
    expect(screen.queryByTestId('book-retry')).toBeNull();
  });

  it('says the project unassigned you and does not offer retry', async () => {
    mockLoadState = { loading: false, error: null, removed: true };

    await render(<BookScreen />);

    expect(
      screen.getByText(
        "You've been unassigned from this project. Go back to see your other work.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('book-retry')).toBeNull();
    expect(screen.queryByTestId('book-list')).toBeNull();
  });

  it('goes back', async () => {
    await render(<BookScreen />);

    await fireEvent.press(screen.getByLabelText('Back'));

    expect(mockBack).toHaveBeenCalled();
  });

  it('strokes the header once the passages scroll under it', async () => {
    jest.useFakeTimers();
    await render(<BookScreen />);
    const stroke = screen.getByTestId('book-header-stroke');
    expect(stroke).toHaveAnimatedStyle({ opacity: 0 });

    await fireEvent.scroll(screen.getByTestId('book-list'), {
      nativeEvent: {
        contentOffset: { x: 0, y: 120 },
        contentSize: { width: 360, height: 2000 },
        layoutMeasurement: { width: 360, height: 640 },
      },
    });
    await act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(stroke).toHaveAnimatedStyle({ opacity: 1 });
  });

  it('drops the stroke when the list gives way to an error', async () => {
    jest.useFakeTimers();
    await render(<BookScreen />);
    await fireEvent.scroll(screen.getByTestId('book-list'), {
      nativeEvent: {
        contentOffset: { x: 0, y: 120 },
        contentSize: { width: 360, height: 2000 },
        layoutMeasurement: { width: 360, height: 640 },
      },
    });
    mockLoadState = { loading: false, error: new Error('x'), removed: false };
    await screen.rerender(<BookScreen />);
    mockLoadState = { loading: false, error: null, removed: false };
    await screen.rerender(<BookScreen />);
    await act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(screen.getByTestId('book-header-stroke')).toHaveAnimatedStyle({
      opacity: 0,
    });
  });
});
