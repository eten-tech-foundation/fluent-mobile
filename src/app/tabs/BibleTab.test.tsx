import React from 'react';
import { Pressable } from 'react-native';
import {
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
import { getProjectPericopeSetId } from '../../db/repository';
import {
  getPericopesForChapter,
  getRecordedVerseNumbers,
  getSelectedTakeCoverages,
} from '../../db/queries';
import type { useDraftingUnit } from '../../hooks/useDraftingUnit';

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
    render(
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
    fireEvent.press(screen.getByLabelText('Verse 2'));
    expect(screen.getByLabelText('Verse 2, selected')).toBeTruthy();
    expect(
      screen.getAllByTestId('bible-verse-waveform').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId('bible-unit-recorded')).toBeNull();
  });

  it('invokes onOpenRecord after selecting a verse unit', async () => {
    const onOpenRecord = jest.fn();

    render(
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
    fireEvent.press(screen.getByLabelText('Verse 2'));

    expect(screen.getByLabelText('Verse 2, selected')).toBeTruthy();
    expect(onOpenRecord).toHaveBeenCalledTimes(1);
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

    render(
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
    fireEvent.press(screen.getByLabelText('Mark 14:1–2, selected'));

    expect(onOpenRecord).toHaveBeenCalledTimes(1);
  });

  it('shows a loading indicator instead of verse rows while coverage loads', () => {
    jest
      .mocked(getSelectedTakeCoverages)
      .mockImplementation(() => new Promise(() => {}));

    render(
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

  it('shows a loading indicator instead of verse rows while pericopes load', () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    jest
      .mocked(getProjectPericopeSetId)
      .mockImplementation(() => new Promise(() => {}));

    render(
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

    render(
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

    fireEvent.press(screen.getByLabelText('Mark 14:1–2, selected'));
    expect(screen.getByTestId('bible-pericope-verse-14-1')).toBeTruthy();
    expect(screen.getByTestId('bible-pericope-verse-14-2')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Mark 14:1–2, selected'));
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

    render(
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

    render(
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

    fireEvent.press(screen.getByLabelText('Mark 14:2, selected'));
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

    render(
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
        startChapter: 14,
        startVerse: 1,
        endChapter: 14,
        endVerse: 2,
      },
    ];
    fireEvent.press(screen.getByTestId('refresh-recorded'));

    await waitFor(() => {
      expect(
        screen.getAllByTestId('bible-unit-recorded').length,
      ).toBeGreaterThan(0);
    });
  });
});
