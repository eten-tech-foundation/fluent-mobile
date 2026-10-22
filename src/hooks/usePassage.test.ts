import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePassage } from './usePassage';
import {
  getBibleTextId,
  getBibleTexts,
  getChapterAssignmentById,
  getPericopeForVerse,
  getSelectedTakeCoverages,
} from '../db/queries';
import { getTakesForVerse } from '../db/recordingsRepository';
import { getProjectPericopeSetId } from '../db/repository';
import { syncBibleTexts } from '../services/sync';

jest.mock('../db/queries', () => ({
  getBibleTextId: jest.fn(),
  getBibleTexts: jest.fn(),
  getChapterAssignmentById: jest.fn(),
  getPericopeForVerse: jest.fn(),
  getSelectedTakeCoverages: jest.fn(),
}));

jest.mock('../db/recordingsRepository', () => ({
  getTakesForVerse: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../services/sync', () => ({
  syncBibleTexts: jest.fn(),
}));

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockSetId = getProjectPericopeSetId as jest.Mock;
const mockPericope = getPericopeForVerse as jest.Mock;
const mockTexts = getBibleTexts as jest.Mock;
const mockCoverages = getSelectedTakeCoverages as jest.Mock;
const mockTextId = getBibleTextId as jest.Mock;
const mockTakes = getTakesForVerse as jest.Mock;
const mockSync = syncBibleTexts as jest.Mock;

const verseTexts = [22, 23, 24, 25].map(n => ({
  bibleId: 1,
  bookId: 41,
  chapterNumber: 14,
  verseNumber: n,
  text: `Verse ${n}`,
}));

function take(overrides: Record<string, unknown>) {
  return {
    id: 'a',
    takeNumber: 1,
    isSelected: false,
    granularity: 'pericope',
    startChapter: 14,
    startVerse: 22,
    endChapter: 14,
    endVerse: 25,
    ...overrides,
  };
}

describe('usePassage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      bibleId: 1,
      bookId: 41,
      chapterNumber: 14,
      bookName: 'Mark',
    });
    mockSetId.mockResolvedValue(7);
    mockPericope.mockResolvedValue({
      pericopeNumber: '2',
      pericopeTitle: 'The Last Supper',
      section: null,
      verses: [22, 23, 24, 25].map(n => ({
        chapterNumber: 14,
        verseNumber: n,
      })),
    });
    mockTexts.mockResolvedValue(verseTexts);
    mockCoverages.mockResolvedValue([
      { startChapter: 14, startVerse: 22, endChapter: 14, endVerse: 23 },
    ]);
    mockTextId.mockResolvedValue(1022);
    mockTakes.mockResolvedValue([
      take({ id: 'a', takeNumber: 1 }),
      take({ id: 'b', takeNumber: 2, isSelected: true }),
      take({ id: 'v', takeNumber: 3, granularity: 'verse', endVerse: 22 }),
      take({ id: 'x', takeNumber: 4, endVerse: 24 }),
    ]);
  });

  it('loads the passage text, status and its whole-passage takes', async () => {
    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(result.current.passage).toEqual({
      status: 'ready',
      title: 'The Last Supper',
      reference: 'Mark 14:22–25',
      verses: verseTexts.map(v => ({
        chapterNumber: 14,
        verseNumber: v.verseNumber,
        text: v.text,
      })),
      downloaded: true,
      recordedStatus: 'partial',
      takes: [
        { id: 'a', takeNumber: 1, selected: false },
        { id: 'b', takeNumber: 2, selected: true },
      ],
    });
    expect(mockPericope).toHaveBeenCalledWith(41, 14, 22, 7);
    expect(mockTakes).toHaveBeenCalledWith(
      1022,
      undefined,
      { chapterNumber: 14, verseNumber: 22 },
      3,
    );
  });

  it('is the whole chapter without a pericope set', async () => {
    mockSetId.mockResolvedValue(null);

    const { result } = renderHook(() => usePassage(5, 1, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(result.current.passage).toMatchObject({
      title: null,
      reference: 'Mark 14',
      takes: [],
    });
    expect(mockTakes).not.toHaveBeenCalled();
  });

  it('is missing when the chapter is gone', async () => {
    mockAssignment.mockResolvedValue(null);

    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('missing'));
  });

  it("downloads the chapter's text when it isn't on the phone", async () => {
    mockTexts.mockResolvedValueOnce([]);
    mockSync.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePassage(5, 22, 3));
    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(result.current.passage).toMatchObject({ downloaded: false });

    act(() => result.current.download());

    await waitFor(() =>
      expect(result.current.passage).toMatchObject({ downloaded: true }),
    );
    expect(mockSync).toHaveBeenCalledWith(undefined, {
      chapterGroups: new Map([[1, [{ bookId: 41, chapterNumber: 14 }]]]),
    });
    expect(result.current.downloadState).toBe('idle');
  });
});
