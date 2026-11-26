import React from 'react';
import { FlatList, Pressable } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { BibleTab } from './BibleTab';
import {
  DraftingProvider,
  useDraftingContext,
} from '../context/DraftingContext';
import { PERICOPE_UNAVAILABLE_WARNING } from '../../constants/messages';
import { getProjectPericopeSetId } from '../../db/repository';
import {
  getPericopesForChapter,
  getRecordedVerseNumbers,
  getSelectedTakeCoverages,
} from '../../db/queries';
import type { useDraftingUnit } from '../../hooks/useDraftingUnit';
import { lastFlatListProps } from '../../test/flatListCapture';

jest.mock('react-native/Libraries/Lists/FlatList', () => ({
  __esModule: true,
  default: require('../../test/flatListCapture').CapturingFlatList,
}));

jest.mock('../../services/storage', () => ({
  getActiveUserId: () => '1',
  getUserIdSync: () => '1',
}));

jest.mock('../../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(async () => 7),
}));

jest.mock('../../db/queries', () => ({
  getBibleTexts: jest.fn(async () => []),
  getRecordedVerseNumbers: jest.fn(async () => new Set()),
  getPericopesForChapter: jest.fn(async () => []),
  getSelectedTakeCoverages: jest.fn(async () => []),
}));

type DraftingUnitApi = ReturnType<typeof useDraftingUnit>;

const mockUseDraftingUnit = jest.fn(
  (): DraftingUnitApi => ({
    draftingUnit: 'verse',
    setDraftingUnit: jest.fn(),
  }),
);

jest.mock('../../hooks/useDraftingUnit', () => ({
  useDraftingUnit: () => mockUseDraftingUnit(),
}));

const verses = [
  {
    bibleId: 1,
    bookId: 1,
    chapterNumber: 14,
    verseNumber: 1,
    text: 'First verse text',
  },
  {
    bibleId: 1,
    bookId: 1,
    chapterNumber: 14,
    verseNumber: 2,
    text: 'Source text for verse 2',
  },
];

function RefreshRecordedButton() {
  const { refreshRecordedVerses } = useDraftingContext();
  return (
    <Pressable
      testID="refresh-recorded"
      onPress={() => {
        void refreshRecordedVerses();
      }}
    />
  );
}

function SetPlayingVerseButton({ verse }: { verse: number }) {
  const { setCurrentlyPlayingVerse } = useDraftingContext();
  return (
    <Pressable
      testID={`set-playing-${verse}`}
      onPress={() => setCurrentlyPlayingVerse(verse)}
    />
  );
}

describe('BibleTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'verse',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getProjectPericopeSetId).mockResolvedValue(7);
    jest.mocked(getPericopesForChapter).mockResolvedValue([]);
    jest.mocked(getSelectedTakeCoverages).mockResolvedValue([]);
  });

  it('keeps the tapped verse selected on the Bible tab', async () => {
    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Verse 2')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('Verse 2'));
    expect(screen.getByLabelText('Verse 2, selected')).toBeTruthy();
    expect(
      screen.getAllByTestId('bible-verse-waveform').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId('bible-unit-recorded')).toBeNull();
  });

  it('invokes onOpenRecord after selecting a verse unit', async () => {
    const onOpenRecord = jest.fn();

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab onOpenRecord={onOpenRecord} />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Verse 2')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('Verse 2'));

    expect(screen.getByLabelText('Verse 2, selected')).toBeTruthy();
    expect(onOpenRecord).toHaveBeenCalledTimes(1);
  });

  it('explains when pericope mode falls back to verse rows with no local data (#588)', async () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getProjectPericopeSetId).mockResolvedValue(null);
    jest.mocked(getPericopesForChapter).mockResolvedValue([]);

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bible-pericope-unavailable')).toBeTruthy();
    });
    expect(screen.getByText(PERICOPE_UNAVAILABLE_WARNING)).toBeTruthy();
    expect(screen.getByLabelText('Verse 1, selected')).toBeTruthy();
    expect(screen.queryByTestId('bible-pericope-1')).toBeNull();
  });

  it('invokes onOpenRecord after pressing a pericope unit', async () => {
    const onOpenRecord = jest.fn();
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getPericopesForChapter).mockResolvedValue([
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 14, verseNumber: 1 },
          { chapterNumber: 14, verseNumber: 2 },
        ],
      },
    ]);

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab onOpenRecord={onOpenRecord} />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Mark 14:1–2, selected')).toBeTruthy();
    });
    await fireEvent.press(screen.getByLabelText('Mark 14:1–2, selected'));

    expect(onOpenRecord).toHaveBeenCalledTimes(1);
    // Card tap opens Record without expanding — expand is chevron-only.
    expect(screen.queryByTestId('bible-pericope-verse-14-1')).toBeNull();
  });

  it('expands and collapses a pericope via chevron without opening Record', async () => {
    const onOpenRecord = jest.fn();
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getPericopesForChapter).mockResolvedValue([
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 14, verseNumber: 1 },
          { chapterNumber: 14, verseNumber: 2 },
        ],
      },
    ]);

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab onOpenRecord={onOpenRecord} />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Expand Mark 14:1–2')).toBeTruthy();
    });

    await fireEvent.press(screen.getByLabelText('Expand Mark 14:1–2'));
    expect(screen.getByTestId('bible-pericope-verse-14-1')).toBeTruthy();
    expect(screen.getByTestId('bible-pericope-verse-14-2')).toBeTruthy();
    expect(onOpenRecord).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Collapse Mark 14:1–2'));
    expect(screen.queryByTestId('bible-pericope-verse-14-1')).toBeNull();
    expect(screen.queryByTestId('bible-pericope-verse-14-2')).toBeNull();
    expect(onOpenRecord).not.toHaveBeenCalled();
  });

  it('shows a loading indicator instead of verse rows while coverage loads', async () => {
    jest
      .mocked(getSelectedTakeCoverages)
      .mockImplementation(() => new Promise(() => {}));

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab />
      </DraftingProvider>,
    );

    expect(screen.getByTestId('bible-tab-loading')).toBeTruthy();
    expect(screen.queryByTestId('bible-tab')).toBeNull();
    expect(screen.queryByLabelText(/Verse /)).toBeNull();
  });

  it('shows a loading indicator instead of verse rows while pericopes load', async () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest
      .mocked(getProjectPericopeSetId)
      .mockImplementation(() => new Promise(() => {}));

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab />
      </DraftingProvider>,
    );

    expect(screen.getByTestId('bible-tab-loading')).toBeTruthy();
    expect(screen.queryByTestId('bible-tab')).toBeNull();
    expect(screen.queryByLabelText(/Verse /)).toBeNull();
  });

  it('renders pericope range cards instead of Pericope N labels', async () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getPericopesForChapter).mockResolvedValue([
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 14, verseNumber: 1 },
          { chapterNumber: 14, verseNumber: 2 },
        ],
      },
    ]);

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Mark 14:1–2, selected')).toBeTruthy();
    });
    expect(screen.queryByTestId('bible-pericope-verse-14-1')).toBeNull();
    expect(screen.queryByTestId('bible-pericope-verse-14-2')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Expand Mark 14:1–2'));
    expect(screen.getByTestId('bible-pericope-verse-14-1')).toBeTruthy();
    expect(screen.getByTestId('bible-pericope-verse-14-2')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Collapse Mark 14:1–2'));
    expect(screen.getByLabelText('Mark 14:1–2, selected')).toBeTruthy();
    expect(screen.queryByTestId('bible-pericope-verse-14-1')).toBeNull();
    expect(screen.queryByTestId('bible-pericope-verse-14-2')).toBeNull();
  });

  it('marks a pericope selected when the selected verse is in the unit, not only the anchor', async () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getPericopesForChapter).mockResolvedValue([
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 14, verseNumber: 1 },
          { chapterNumber: 14, verseNumber: 2 },
        ],
      },
    ]);

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={2}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Mark 14:1–2, selected')).toBeTruthy();
    });
  });

  it('expands the current-chapter pericope, not a cross-chapter verse-number collision', async () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getPericopesForChapter).mockResolvedValue([
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 13, verseNumber: 2 },
          { chapterNumber: 14, verseNumber: 1 },
        ],
      },
      {
        pericopeNumber: '2',
        pericopeTitle: null,
        section: 1,
        verses: [{ chapterNumber: 14, verseNumber: 2 }],
      },
    ]);

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={2}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <BibleTab />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Mark 14:2, selected')).toBeTruthy();
    });
    expect(screen.queryByTestId('bible-pericope-verse-14-2')).toBeNull();
    expect(screen.queryByTestId('bible-pericope-verse-14-1')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Expand Mark 14:2'));
    expect(screen.getByTestId('bible-pericope-verse-14-2')).toBeTruthy();
    expect(screen.queryByTestId('bible-pericope-verse-14-1')).toBeNull();
  });

  it('refreshes recorded status when coverage changes without changing recorded count', async () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getRecordedVerseNumbers).mockResolvedValue(new Set([1]));
    let coverages: {
      granularity: string;
      startChapter: number;
      startVerse: number;
      endChapter: number;
      endVerse: number;
    }[] = [];
    jest
      .mocked(getSelectedTakeCoverages)
      .mockImplementation(async () => coverages);
    jest.mocked(getPericopesForChapter).mockResolvedValue([
      {
        pericopeNumber: '1',
        pericopeTitle: null,
        section: 1,
        verses: [
          { chapterNumber: 14, verseNumber: 1 },
          { chapterNumber: 14, verseNumber: 2 },
        ],
      },
    ]);

    await render(
      <DraftingProvider
        verses={verses}
        initialVerse={1}
        projectId={9}
        chapterName="Mark 14"
        bookName="Mark"
      >
        <RefreshRecordedButton />
        <BibleTab />
      </DraftingProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getAllByTestId('bible-unit-unrecorded').length,
      ).toBeGreaterThan(0);
    });

    coverages = [
      {
        granularity: 'pericope',
        startChapter: 14,
        startVerse: 1,
        endChapter: 14,
        endVerse: 2,
      },
    ];
    await fireEvent.press(screen.getByTestId('refresh-recorded'));

    await waitFor(() => {
      expect(
        screen.getAllByTestId('bible-unit-recorded').length,
      ).toBeGreaterThan(0);
    });
  });

  describe('verse-row accessibility selected vs playing (#48 / D-0048-01 observability)', () => {
    it('exposes selected-only, playing-only, both, and neither labels', async () => {
      await render(
        <DraftingProvider
          verses={verses}
          initialVerse={1}
          chapterName="Mark 14"
          bookName="Mark"
        >
          <SetPlayingVerseButton verse={1} />
          <SetPlayingVerseButton verse={2} />
          <BibleTab />
        </DraftingProvider>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Verse 1, selected')).toBeTruthy();
      });
      expect(screen.getByLabelText('Verse 2')).toBeTruthy();
      expect(screen.queryByLabelText('Verse 1, selected, playing')).toBeNull();
      expect(screen.queryByLabelText('Verse 2, playing')).toBeNull();

      await act(async () => {
        await fireEvent.press(screen.getByTestId('set-playing-2'));
      });
      await waitFor(() => {
        expect(screen.getByLabelText('Verse 2, playing')).toBeTruthy();
      });
      expect(screen.getByLabelText('Verse 1, selected')).toBeTruthy();
      expect(screen.queryByLabelText('Verse 2, selected')).toBeNull();
      expect(screen.queryByLabelText('Verse 1, selected, playing')).toBeNull();

      await act(async () => {
        await fireEvent.press(screen.getByTestId('set-playing-1'));
      });
      await waitFor(() => {
        expect(
          screen.getByLabelText('Verse 1, selected, playing'),
        ).toBeTruthy();
      });
      expect(screen.getByLabelText('Verse 2')).toBeTruthy();
      expect(screen.queryByLabelText('Verse 2, playing')).toBeNull();
    });

    it('updates playing a11y when currentlyPlayingVerse changes without changing selection', async () => {
      const threeVerses = [
        ...verses,
        {
          bibleId: 1,
          bookId: 1,
          chapterNumber: 14,
          verseNumber: 3,
          text: 'Third verse text',
        },
      ];

      await render(
        <DraftingProvider
          verses={threeVerses}
          initialVerse={1}
          chapterName="Mark 14"
          bookName="Mark"
        >
          <SetPlayingVerseButton verse={2} />
          <SetPlayingVerseButton verse={3} />
          <BibleTab />
        </DraftingProvider>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Verse 1, selected')).toBeTruthy();
      });

      await act(async () => {
        await fireEvent.press(screen.getByTestId('set-playing-2'));
      });
      await waitFor(() => {
        expect(screen.getByLabelText('Verse 2, playing')).toBeTruthy();
      });
      expect(screen.getByLabelText('Verse 1, selected')).toBeTruthy();

      await act(async () => {
        await fireEvent.press(screen.getByTestId('set-playing-3'));
      });
      await waitFor(() => {
        expect(screen.getByLabelText('Verse 3, playing')).toBeTruthy();
      });
      expect(screen.getByLabelText('Verse 1, selected')).toBeTruthy();
      expect(screen.queryByLabelText('Verse 2, playing')).toBeNull();
      expect(screen.queryByLabelText('Verse 1, selected, playing')).toBeNull();
    });
  });

  it('scrolls the playing verse into view when currentlyPlayingVerse changes (#595)', async () => {
    const scrollToIndex = jest.fn();
    const spy = jest
      .spyOn(FlatList.prototype, 'scrollToIndex')
      .mockImplementation(scrollToIndex);

    try {
      const manyVerses = Array.from({ length: 12 }, (_, i) => ({
        bibleId: 1,
        bookId: 1,
        chapterNumber: 14,
        verseNumber: i + 1,
        text: `Verse ${i + 1} text`,
      }));

      await render(
        <DraftingProvider
          verses={manyVerses}
          initialVerse={1}
          chapterName="Mark 14"
          bookName="Mark"
        >
          <SetPlayingVerseButton verse={8} />
          <BibleTab />
        </DraftingProvider>,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Verse 8')).toBeTruthy();
      });

      await act(async () => {
        await fireEvent.press(screen.getByTestId('set-playing-8'));
      });

      await waitFor(() => {
        expect(scrollToIndex).toHaveBeenCalledWith(
          expect.objectContaining({ index: 7, animated: true }),
        );
      });
    } finally {
      spy.mockRestore();
    }
  });

  it.each(['verse', 'pericope'] as const)(
    'retries scrollToIndex on scroll failure in %s mode (#595)',
    async mode => {
      const scrollToIndex = jest.fn();
      const spy = jest
        .spyOn(FlatList.prototype, 'scrollToIndex')
        .mockImplementation(scrollToIndex);
      mockUseDraftingUnit.mockReturnValue({
        draftingUnit: mode,
        setDraftingUnit: jest.fn(),
      });
      jest.mocked(getPericopesForChapter).mockResolvedValue([
        {
          pericopeNumber: '1',
          pericopeTitle: null,
          section: 1,
          verses: [
            { chapterNumber: 14, verseNumber: 1 },
            { chapterNumber: 14, verseNumber: 2 },
          ],
        },
      ]);

      try {
        await render(
          <DraftingProvider
            verses={verses}
            initialVerse={1}
            projectId={9}
            chapterName="Mark 14"
            bookName="Mark"
          >
            <BibleTab />
          </DraftingProvider>,
        );

        await waitFor(() => {
          expect(lastFlatListProps().onScrollToIndexFailed).toEqual(
            expect.any(Function),
          );
        });

        scrollToIndex.mockClear();
        await act(() => {
          lastFlatListProps().onScrollToIndexFailed?.({
            index: 1,
            highestMeasuredFrameIndex: 0,
            averageItemLength: 0,
          });
        });

        await waitFor(() => {
          expect(scrollToIndex).toHaveBeenCalledWith({
            index: 1,
            animated: false,
          });
        });
      } finally {
        spy.mockRestore();
      }
    },
  );
});
