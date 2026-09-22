import { renderHook, waitFor } from '@testing-library/react-native';
import { useBibleTabUnits } from './useBibleTabUnits';
import { getProjectPericopeSetId } from '../db/repository';
import {
  getBibleTexts,
  getPericopesForChapter,
  getSelectedTakeCoverages,
} from '../db/queries';
import type { useDraftingUnit } from './useDraftingUnit';
import type { VerseData } from '../types/db/types';

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getBibleTexts: jest.fn(async () => []),
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

    expect(result.current.unitsPending).toBe(true);

    await waitFor(() => {
      expect(result.current.unitsPending).toBe(false);
    });
    expect(result.current.units).toHaveLength(2);
    expect(result.current.unitCaption).toBe('Verse 2 / 2');
    expect(result.current.units.map(u => u.title)).toEqual(['1', '2']);
  });

  it('does not fall back to verse rows while pericope data is still loading', async () => {
    mockUseDraftingUnit.mockReturnValue({
      draftingUnit: 'pericope',
      setDraftingUnit: jest.fn(),
    });
    let resolveSetId: (value: number | null) => void = () => {};
    jest.mocked(getProjectPericopeSetId).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveSetId = resolve;
        }),
    );
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

    expect(result.current.effectiveUnit).toBe('pericope');
    expect(result.current.unitsPending).toBe(true);
    expect(result.current.units).toHaveLength(0);

    resolveSetId(7);

    await waitFor(() => {
      expect(result.current.units).toHaveLength(1);
    });
    expect(result.current.effectiveUnit).toBe('pericope');
    expect(result.current.unitsPending).toBe(false);
    expect(result.current.units[0]?.title).toBe('Mark 14:1–2');
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

  it('drops previous pericopes when the project has no pericope set', async () => {
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

    const { result, rerender } = renderHook(
      (props: typeof hookArgs) => useBibleTabUnits(props),
      { initialProps: hookArgs },
    );

    await waitFor(() => {
      expect(result.current.effectiveUnit).toBe('pericope');
    });

    jest.mocked(getProjectPericopeSetId).mockResolvedValue(null);
    rerender({ ...hookArgs, projectId: 10 });

    await waitFor(() => {
      expect(result.current.effectiveUnit).toBe('verse');
    });
    expect(result.current.units.map(u => u.title)).toEqual(['1', '2']);
  });

  it('resolves body text for pericope verses in another chapter via getBibleTexts', async () => {
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
          { chapterNumber: 14, verseNumber: 2 },
          { chapterNumber: 15, verseNumber: 1 },
        ],
      },
    ]);
    jest.mocked(getBibleTexts).mockResolvedValue([
      {
        bibleId: 1,
        bookId: 40,
        chapterNumber: 15,
        verseNumber: 1,
        text: 'Chapter fifteen verse one.',
      },
    ]);

    const { result } = renderHook(() => useBibleTabUnits(hookArgs));

    await waitFor(() => {
      expect(result.current.units[0]?.bodyVerses).toEqual([
        { chapterNumber: 14, verseNumber: 2, text: 'Second' },
        {
          chapterNumber: 15,
          verseNumber: 1,
          text: 'Chapter fifteen verse one.',
        },
      ]);
    });
    expect(getBibleTexts).toHaveBeenCalledWith(1, 40, 15);
  });
});
