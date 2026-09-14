import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { BibleTab } from './BibleTab';
import { DraftingProvider } from '../context/DraftingContext';
import { getPericopesForChapter } from '../../db/queries';
import type { useDraftingUnit } from '../../hooks/useDraftingUnit';

jest.mock('../../services/storage', () => ({
  getActiveUserId: () => '1',
  getUserIdSync: () => '1',
}));

jest.mock('../../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(async () => 7),
}));

jest.mock('../../db/queries', () => ({
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

describe('BibleTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'verse',
      setDraftingUnit: jest.fn(),
    });
    jest.mocked(getPericopesForChapter).mockResolvedValue([]);
  });

  it('keeps the tapped verse selected on the Bible tab', () => {
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

    fireEvent.press(screen.getByLabelText('Verse 2'));
    expect(screen.getByLabelText('Verse 2, selected')).toBeTruthy();
    expect(
      screen.getAllByTestId('bible-verse-waveform').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId('bible-unit-recorded')).toBeNull();
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
    expect(screen.queryByText(/Pericope 1/)).toBeNull();
    expect(screen.getByTestId('bible-pericope-verse-1')).toBeTruthy();
    expect(screen.getByTestId('bible-pericope-verse-2')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Mark 14:1–2, selected'));
    expect(screen.getByLabelText('Mark 14:1–2, selected')).toBeTruthy();
    expect(screen.queryByTestId('bible-pericope-verse-1')).toBeNull();
    expect(screen.queryByTestId('bible-pericope-verse-2')).toBeNull();
  });
});
