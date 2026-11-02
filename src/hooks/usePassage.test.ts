import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePassage } from './usePassage';
import {
  getBibleTextId,
  getBibleTexts,
  getChapterAssignmentById,
  getChapterAssignmentVerseCount,
  getPericopeForVerse,
  getSelectedTakeCoverages,
  hasPendingStageAdvance,
} from '../db/queries';
import { getTakesForVerse } from '../db/recordingsRepository';
import { getProjectPericopeSetId } from '../db/repository';
import { ensureSourceLanguageIso, syncBibleTexts } from '../services/sync';
import { emitSyncComplete } from '../services/syncEvents';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    focusEffect = effect;
    require('react').useEffect(effect, [effect]);
  },
}));

jest.mock('../db/queries', () => ({
  getBibleTextId: jest.fn(),
  getBibleTexts: jest.fn(),
  getChapterAssignmentById: jest.fn(),
  getChapterAssignmentVerseCount: jest.fn(),
  getPericopeForVerse: jest.fn(),
  getSelectedTakeCoverages: jest.fn(),
  hasPendingStageAdvance: jest.fn(),
}));

jest.mock('../db/recordingsRepository', () => ({
  getTakesForVerse: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../services/sync', () => ({
  syncBibleTexts: jest.fn(),
  ensureSourceLanguageIso: jest.fn(),
}));

let mockOnline = false;
jest.mock('./useConnectivity', () => ({
  useConnectivity: () => ({ isOnline: mockOnline, hasResolved: true }),
}));

let focusEffect: (() => void) | null = null;

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockSetId = getProjectPericopeSetId as jest.Mock;
const mockPericope = getPericopeForVerse as jest.Mock;
const mockTexts = getBibleTexts as jest.Mock;
const mockCoverages = getSelectedTakeCoverages as jest.Mock;
const mockTextId = getBibleTextId as jest.Mock;
const mockTakes = getTakesForVerse as jest.Mock;
const mockSync = syncBibleTexts as jest.Mock;
const mockVerseCount = getChapterAssignmentVerseCount as jest.Mock;
const mockPending = hasPendingStageAdvance as jest.Mock;
const mockEnsureIso = ensureSourceLanguageIso as jest.Mock;

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
    createdAt: '2026-10-20T10:00:00Z',
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
    mockOnline = false;
    mockEnsureIso.mockResolvedValue(false);
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      bibleId: 1,
      bookId: 41,
      chapterNumber: 14,
      bookName: 'Mark',
      sourceLanguageCode: 'eng',
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
    mockVerseCount.mockResolvedValue(0);
    mockPending.mockResolvedValue(false);
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
      assignment: expect.objectContaining({ id: 5, chapterNumber: 14 }),
      chapterVerseCount: 4,
      waitingToSend: false,
      takes: [
        {
          id: 'a',
          takeNumber: 1,
          selected: false,
          recordedAt: '2026-10-20T10:00:00Z',
        },
        {
          id: 'b',
          takeNumber: 2,
          selected: true,
          recordedAt: '2026-10-20T10:00:00Z',
        },
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

  it('downloads the missing text once on open when online, like Legacy drafting', async () => {
    mockOnline = true;
    mockTexts.mockResolvedValueOnce([]);
    mockSync.mockResolvedValue(undefined);

    const { result, rerender } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() =>
      expect(result.current.passage).toMatchObject({ downloaded: true }),
    );
    expect(mockSync).toHaveBeenCalledTimes(1);
    rerender({});
    act(() => focusEffect?.());
    await waitFor(() => expect(mockAssignment).toHaveBeenCalledTimes(2));
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("doesn't download on open while offline", async () => {
    mockTexts.mockResolvedValue([]);

    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() =>
      expect(result.current.passage).toMatchObject({ downloaded: false }),
    );
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('downloads only once when the text still is missing after', async () => {
    mockOnline = true;
    mockTexts.mockResolvedValue([]);
    mockSync.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() => expect(result.current.downloadState).toBe('failed'));
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('repairs a missing source-language code, then reloads', async () => {
    mockOnline = true;
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      bibleId: 1,
      bookId: 41,
      chapterNumber: 14,
      bookName: 'Mark',
      sourceLanguageCode: '',
    });
    mockEnsureIso.mockResolvedValueOnce(true);

    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    await waitFor(() =>
      expect(mockEnsureIso).toHaveBeenCalledWith(9, expect.any(Function)),
    );
    await waitFor(() => expect(mockAssignment).toHaveBeenCalledTimes(2));
  });

  it('waits to repair the code until online', async () => {
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      bibleId: 1,
      bookId: 41,
      chapterNumber: 14,
      bookName: 'Mark',
      sourceLanguageCode: '',
    });

    const { result, rerender } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(mockEnsureIso).not.toHaveBeenCalled();

    mockOnline = true;
    rerender({});
    await waitFor(() =>
      expect(mockEnsureIso).toHaveBeenCalledWith(9, expect.any(Function)),
    );
  });

  it("doesn't repair the code when it's there", async () => {
    mockOnline = true;
    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(mockEnsureIso).not.toHaveBeenCalled();
  });

  it('is not downloaded while a pericope verse has no text', async () => {
    mockTexts.mockResolvedValue(
      verseTexts.map(v => (v.verseNumber === 25 ? { ...v, text: '' } : v)),
    );

    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(result.current.passage).toMatchObject({ downloaded: false });
  });

  it('is not downloaded when the chapter count is unknown', async () => {
    mockSetId.mockResolvedValue(null);
    mockVerseCount.mockResolvedValue(0);

    const { result } = renderHook(() => usePassage(5, 1, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(result.current.passage).toMatchObject({ downloaded: false });
  });

  it('is downloaded when every verse the chapter contains has text', async () => {
    mockSetId.mockResolvedValue(null);
    mockVerseCount.mockResolvedValue(verseTexts.length);

    const { result } = renderHook(() => usePassage(5, 1, 3));

    await waitFor(() => expect(result.current.passage.status).toBe('ready'));
    expect(result.current.passage).toMatchObject({ downloaded: true });
  });

  it('downloads every chapter the passage spans', async () => {
    mockPericope.mockResolvedValue({
      pericopeNumber: '2',
      pericopeTitle: 'Across',
      section: null,
      verses: [
        { chapterNumber: 14, verseNumber: 25 },
        { chapterNumber: 15, verseNumber: 1 },
      ],
    });
    mockTexts.mockResolvedValue([]);
    mockSync.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePassage(5, 25, 3));
    await waitFor(() =>
      expect(result.current.passage).toMatchObject({ downloaded: false }),
    );

    act(() => result.current.download());

    await waitFor(() => expect(mockSync).toHaveBeenCalled());
    expect(mockSync).toHaveBeenCalledWith(undefined, {
      chapterGroups: new Map([
        [
          1,
          [
            { bookId: 41, chapterNumber: 14 },
            { bookId: 41, chapterNumber: 15 },
          ],
        ],
      ]),
    });
  });

  it('shows waiting to send while a stage advance is queued', async () => {
    mockPending.mockResolvedValue(true);

    const { result } = renderHook(() => usePassage(5, 22, 3));

    await waitFor(() =>
      expect(result.current.passage).toMatchObject({ waitingToSend: true }),
    );
  });

  it('reloads after a sync and keeps the passage when the reload fails', async () => {
    const { result } = renderHook(() => usePassage(5, 22, 3));
    await waitFor(() => expect(result.current.passage.status).toBe('ready'));

    mockAssignment.mockRejectedValueOnce(new Error('offline'));
    act(() => emitSyncComplete());

    await waitFor(() => expect(mockAssignment).toHaveBeenCalledTimes(2));
    expect(result.current.passage.status).toBe('ready');
  });

  it('drops the previous passage when a different chapter fails to load', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => usePassage(id, 22, 3),
      { initialProps: { id: 5 } },
    );
    await waitFor(() => expect(result.current.passage.status).toBe('ready'));

    mockAssignment.mockRejectedValueOnce(new Error('gone'));
    rerender({ id: 6 });

    await waitFor(() => expect(result.current.passage.status).toBe('missing'));
  });

  it('reloads when the screen is focused again', async () => {
    const { result } = renderHook(() => usePassage(5, 22, 3));
    await waitFor(() => expect(result.current.passage.status).toBe('ready'));

    act(() => focusEffect?.());

    await waitFor(() => expect(mockAssignment).toHaveBeenCalledTimes(2));
  });
});
