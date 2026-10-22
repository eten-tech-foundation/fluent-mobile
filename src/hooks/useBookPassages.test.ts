import { renderHook, waitFor } from '@testing-library/react-native';
import { coverVerses, useBookPassages } from './useBookPassages';
import { getProjectPericopeSetId } from '../db/repository';
import {
  getChapterAssignmentById,
  getPericopesForChapter,
  getSelectedTakeCoverages,
} from '../db/queries';
import type { ProjectChapter } from '../types/db/types';

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: jest.fn(),
  getPericopesForChapter: jest.fn(),
  getSelectedTakeCoverages: jest.fn(),
}));

const mockSetId = getProjectPericopeSetId as jest.Mock;
const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockPericopes = getPericopesForChapter as jest.Mock;
const mockCoverages = getSelectedTakeCoverages as jest.Mock;

function chapter(
  id: number,
  chapterNumber: number,
  overrides: Partial<ProjectChapter> = {},
): ProjectChapter {
  return {
    id,
    displayLabel: `Mark ${chapterNumber}`,
    bookName: 'Mark',
    chapterNumber,
    workflowStage: null,
    syncState: 'synced',
    ownershipState: 'mine',
    completedVerses: 0,
    totalVerses: 20,
    downloadedVerses: 20,
    hasConflict: false,
    ...overrides,
  } as ProjectChapter;
}

const verses = (chapterNumber: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    chapterNumber,
    verseNumber: from + i,
  }));

describe('coverVerses', () => {
  it('shows a range in the chapter by verse numbers', () => {
    expect(coverVerses(verses(14, 22, 25), 14)).toBe('22–25');
    expect(coverVerses(verses(14, 9, 9), 14)).toBe('9');
  });

  it('adds chapters when the passage crosses or starts elsewhere', () => {
    expect(coverVerses([...verses(1, 30, 31), ...verses(2, 1, 3)], 2)).toBe(
      '1:30–2:3',
    );
    expect(coverVerses(verses(1, 30, 31), 2)).toBe('1:30–31');
  });
});

describe('useBookPassages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetId.mockResolvedValue(7);
    mockAssignment.mockImplementation(async (id: number) => ({
      id,
      bibleId: 1,
      bookId: 41,
      chapterNumber: id === 1 ? 14 : 15,
    }));
    mockCoverages.mockResolvedValue([
      { startChapter: 14, startVerse: 1, endChapter: 14, endVerse: 2 },
      { startChapter: 14, startVerse: 22, endChapter: 14, endVerse: 23 },
    ]);
  });

  it("lists each chapter's passages with how much is recorded", async () => {
    mockPericopes.mockImplementation(async (_book: number, ch: number) =>
      ch === 14
        ? [
            {
              pericopeNumber: '1',
              pericopeTitle: 'The Plot to Kill Jesus',
              section: null,
              verses: verses(14, 1, 2),
            },
            {
              pericopeNumber: '2',
              pericopeTitle: ' The Last Supper ',
              section: null,
              verses: verses(14, 22, 25),
            },
          ]
        : [
            {
              pericopeNumber: '3',
              pericopeTitle: null,
              section: null,
              verses: verses(15, 1, 5),
            },
          ],
    );
    const chapters = [chapter(1, 14), chapter(2, 15)];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.byChapter.get(1)).toEqual([
      expect.objectContaining({
        title: 'The Plot to Kill Jesus',
        reference: 'Mark 14:1–2',
        verses: '1–2',
        anchorVerse: 1,
        recordedStatus: 'recorded',
      }),
      expect.objectContaining({
        title: 'The Last Supper',
        verses: '22–25',
        anchorVerse: 22,
        recordedStatus: 'partial',
      }),
    ]);
    expect(result.current.byChapter.get(2)).toEqual([
      expect.objectContaining({ title: null, recordedStatus: 'none' }),
    ]);
  });

  it('reads coverage once per book, scoped to the milestone', async () => {
    mockPericopes.mockResolvedValue([]);
    const chapters = [chapter(1, 14), chapter(2, 15)];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockCoverages).toHaveBeenCalledTimes(1);
    expect(mockCoverages).toHaveBeenCalledWith(1, 41, 3);
  });

  it('treats a chapter without pericopes as one passage', async () => {
    mockSetId.mockResolvedValue(null);
    const chapters = [chapter(1, 14, { completedVerses: 5, totalVerses: 72 })];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.byChapter.get(1)).toEqual([
      expect.objectContaining({
        title: null,
        reference: 'Mark 14',
        verses: '1–72',
        anchorVerse: 1,
        recordedStatus: 'partial',
      }),
    ]);
    expect(mockPericopes).not.toHaveBeenCalled();
  });
});
