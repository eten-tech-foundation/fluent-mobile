import { renderHook, waitFor } from '@testing-library/react-native';
import { useBibleTabUnits } from './useBibleTabUnits';
import { getProjectPericopeSetId } from '../db/repository';
import {
  getPericopesForChapter,
  getSelectedTakeCoverages,
} from '../db/queries';
import type { useDraftingUnit } from './useDraftingUnit';
import type { VerseData } from '../types/db/types';

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getPericopesForChapter: jest.fn(),
  getSelectedTakeCoverages: jest.fn(),
}));

type DraftingUnitApi = ReturnType<typeof useDraftingUnit>;

const mockUseDraftingUnit = jest.fn(
  (): DraftingUnitApi => ({
    draftingUnit: 'verse',
    setDraftingUnit: jest.fn(),
  }),
);

jest.mock('./useDraftingUnit', () => ({
  useDraftingUnit: () => mockUseDraftingUnit(),
}));

const verses: VerseData[] = [
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 1,
    text: 'First',
  },
  {
    bibleId: 1,
    bookId: 40,
    chapterNumber: 14,
    verseNumber: 2,
    text: 'Second',
  },
];

const hookArgs = {
  bibleId: 1,
  bookId: 40,
  chapterNumber: 14,
  projectId: 9,
  verses,
  chapterName: 'Mark 14',
  bookName: 'Mark',
  selectedVerse: 2,
};

describe('useBibleTabUnits', () => {
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

  it('returns verse rows and a Verse caption in verse mode', async () => {
    const { result } = renderHook(() => useBibleTabUnits(hookArgs));

    await waitFor(() => {
      expect(result.current.units).toHaveLength(2);
    });
    expect(result.current.unitCaption).toBe('Verse 2 / 2');
    expect(result.current.units.map(u => u.title)).toEqual(['1', '2']);
  });

  it('returns pericope cards and a Pericope caption in pericope mode', async () => {
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

    const { result } = renderHook(() => useBibleTabUnits(hookArgs));

    await waitFor(() => {
      expect(result.current.units).toHaveLength(1);
    });
    expect(result.current.units[0]?.title).toBe('Mark 14:1–2');
    expect(result.current.unitCaption).toBe('Pericope 1 / 1');
  });
});
