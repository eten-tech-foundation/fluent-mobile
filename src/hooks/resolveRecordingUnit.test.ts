import { resolveRecordingUnit } from './resolveRecordingUnit';
import { getBibleTextId, getPericopeForVerse } from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';

jest.mock('../db/queries', () => ({
  getBibleTextId: jest.fn(),
  getPericopeForVerse: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

const mockGetBibleTextId = getBibleTextId as jest.MockedFunction<
  typeof getBibleTextId
>;
const mockGetPericopeForVerse = getPericopeForVerse as jest.MockedFunction<
  typeof getPericopeForVerse
>;
const mockGetProjectPericopeSetId =
  getProjectPericopeSetId as jest.MockedFunction<
    typeof getProjectPericopeSetId
  >;

describe('resolveRecordingUnit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a verse unit for verse mode', async () => {
    const unit = await resolveRecordingUnit({
      draftingUnit: 'verse',
      projectId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 14,
      verseNumber: 3,
      selectedBibleTextId: 42,
    });
    expect(unit).toEqual({
      granularity: 'verse',
      startChapter: 14,
      startVerse: 3,
      endChapter: 14,
      endVerse: 3,
      anchorBibleTextId: 42,
      coveredViews: [{ bibleTextId: 42, chapterNumber: 14, verseNumber: 3 }],
    });
    expect(mockGetProjectPericopeSetId).not.toHaveBeenCalled();
  });

  it('falls back to verse when pericope data is missing', async () => {
    mockGetProjectPericopeSetId.mockResolvedValue(null);
    const unit = await resolveRecordingUnit({
      draftingUnit: 'pericope',
      projectId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 14,
      verseNumber: 3,
      selectedBibleTextId: 42,
    });
    expect(unit?.granularity).toBe('verse');
    expect(unit?.startVerse).toBe(3);
  });

  it('builds a pericope unit spanning covered verses', async () => {
    mockGetProjectPericopeSetId.mockResolvedValue(9);
    mockGetPericopeForVerse.mockResolvedValue({
      pericopeNumber: '1.1',
      pericopeTitle: 'Title',
      verses: [
        { chapterNumber: 14, verseNumber: 3 },
        { chapterNumber: 14, verseNumber: 4 },
        { chapterNumber: 14, verseNumber: 5 },
      ],
    });
    mockGetBibleTextId
      .mockResolvedValueOnce(103)
      .mockResolvedValueOnce(104)
      .mockResolvedValueOnce(105);

    const unit = await resolveRecordingUnit({
      draftingUnit: 'pericope',
      projectId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 14,
      verseNumber: 4,
      selectedBibleTextId: 104,
    });

    expect(unit).toMatchObject({
      granularity: 'pericope',
      startChapter: 14,
      startVerse: 3,
      endChapter: 14,
      endVerse: 5,
      anchorBibleTextId: 103,
    });
    expect(unit?.coveredViews).toHaveLength(3);
  });
});
