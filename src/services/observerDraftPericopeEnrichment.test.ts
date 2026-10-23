import { getPericopeForVerse } from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import { enrichObserverDraftUnitsWithLocalPericope } from './observerDraftPericopeEnrichment';
import type { ObserverDraftUnit } from '../app/tabs/ObserverDraftTab';

jest.mock('../db/queries', () => ({
  getPericopeForVerse: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

const mockGetPericopeForVerse = getPericopeForVerse as jest.MockedFunction<
  typeof getPericopeForVerse
>;
const mockGetProjectPericopeSetId =
  getProjectPericopeSetId as jest.MockedFunction<
    typeof getProjectPericopeSetId
  >;

function unit(overrides: Partial<ObserverDraftUnit> = {}): ObserverDraftUnit {
  return {
    bibleTextId: 501,
    verseNumber: 3,
    draftText: 'Draft',
    activeTakeId: 55,
    localPlaybackUri: 'file:///55.m4a',
    conflictStatus: 'clean',
    coverage: {
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    },
    pericopeNumber: null,
    pericopeSetId: null,
    ...overrides,
  };
}

describe('enrichObserverDraftUnitsWithLocalPericope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves exact pericope ids when coverage is pericope and local set/group exist', async () => {
    mockGetProjectPericopeSetId.mockResolvedValue(12);
    mockGetPericopeForVerse.mockResolvedValue({
      pericopeNumber: '1.2',
      pericopeTitle: 'Title',
      section: null,
      verses: [
        { chapterNumber: 1, verseNumber: 3 },
        { chapterNumber: 1, verseNumber: 4 },
      ],
    });

    const result = await enrichObserverDraftUnitsWithLocalPericope({
      units: [unit()],
      projectId: 9,
      bookId: 40,
      chapterNumber: 1,
    });

    expect(mockGetProjectPericopeSetId).toHaveBeenCalledWith(9);
    expect(mockGetPericopeForVerse).toHaveBeenCalledWith(40, 1, 3, 12);
    expect(result).toEqual([
      expect.objectContaining({
        bibleTextId: 501,
        coverage: expect.objectContaining({ granularity: 'pericope' }),
        pericopeNumber: '1.2',
        pericopeSetId: 12,
      }),
    ]);
  });

  it('fails closed when project has no pericope_set_id', async () => {
    mockGetProjectPericopeSetId.mockResolvedValue(null);

    const result = await enrichObserverDraftUnitsWithLocalPericope({
      units: [unit()],
      projectId: 9,
      bookId: 40,
      chapterNumber: 1,
    });

    expect(mockGetPericopeForVerse).not.toHaveBeenCalled();
    expect(result[0]).toEqual(
      expect.objectContaining({
        pericopeNumber: null,
        pericopeSetId: null,
        coverage: expect.objectContaining({ granularity: 'pericope' }),
      }),
    );
  });

  it('fails closed when verse is missing from the project set', async () => {
    mockGetProjectPericopeSetId.mockResolvedValue(12);
    mockGetPericopeForVerse.mockResolvedValue(null);

    const result = await enrichObserverDraftUnitsWithLocalPericope({
      units: [unit()],
      projectId: 9,
      bookId: 40,
      chapterNumber: 1,
    });

    expect(result[0]).toEqual(
      expect.objectContaining({
        pericopeNumber: null,
        pericopeSetId: null,
      }),
    );
  });

  it('does not invent pericope ids for verse coverage or legacy null coverage', async () => {
    mockGetProjectPericopeSetId.mockResolvedValue(12);
    mockGetPericopeForVerse.mockResolvedValue({
      pericopeNumber: '9.9',
      pericopeTitle: 'Should not apply',
      section: null,
      verses: [{ chapterNumber: 1, verseNumber: 3 }],
    });

    const result = await enrichObserverDraftUnitsWithLocalPericope({
      units: [
        unit({
          coverage: {
            granularity: 'verse',
            startChapter: 1,
            startVerse: 3,
            endChapter: 1,
            endVerse: 3,
          },
        }),
        unit({ coverage: null, bibleTextId: 502 }),
      ],
      projectId: 9,
      bookId: 40,
      chapterNumber: 1,
    });

    expect(mockGetProjectPericopeSetId).not.toHaveBeenCalled();
    expect(mockGetPericopeForVerse).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        bibleTextId: 501,
        pericopeNumber: null,
        pericopeSetId: null,
      }),
      expect.objectContaining({
        bibleTextId: 502,
        pericopeNumber: null,
        pericopeSetId: null,
      }),
    ]);
  });

  it('fails closed for invalid project/book/chapter scope ids', async () => {
    const result = await enrichObserverDraftUnitsWithLocalPericope({
      units: [unit()],
      projectId: 0,
      bookId: 40,
      chapterNumber: 1,
    });

    expect(mockGetProjectPericopeSetId).not.toHaveBeenCalled();
    expect(result[0]?.pericopeNumber).toBeNull();
    expect(result[0]?.pericopeSetId).toBeNull();
  });
});
