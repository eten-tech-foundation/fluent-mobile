import { renderHook, waitFor } from '@testing-library/react-native';
import {
  coverVerses,
  loadChapterPassages,
  useBookPassages,
} from './useBookPassages';
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

describe('loadChapterPassages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssignment.mockResolvedValue({
      id: 1,
      bibleId: 1,
      bookId: 41,
      chapterNumber: 14,
    });
    mockPericopes.mockResolvedValue([
      {
        pericopeNumber: '9',
        pericopeTitle: null,
        section: null,
        verses: [...verses(14, 72, 72), ...verses(15, 1, 5)],
      },
    ]);
  });

  it("gives the chapters a passage crosses into this one's stage without stageOf", async () => {
    const coveragesFor = jest.fn().mockResolvedValue([]);

    const passages = await loadChapterPassages(
      chapter(1, 14, { workflowStage: 'peer_check' }),
      7,
      coveragesFor,
    );

    expect(passages).toEqual([
      expect.objectContaining({
        recordedStatus: 'recorded',
        recordedVerses: 6,
        submitted: true,
        peerChecked: false,
      }),
    ]);
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
    expect(result.current.pericopes).toBe(true);
    expect(result.current.byChapter.get(1)).toEqual([
      expect.objectContaining({
        title: 'The Plot to Kill Jesus',
        reference: 'Mark 14:1–2',
        verses: '1–2',
        anchorVerse: 1,
        recordedStatus: 'recorded',
        recordedVerses: 2,
        totalVerses: 2,
      }),
      expect.objectContaining({
        title: 'The Last Supper',
        verses: '22–25',
        anchorVerse: 22,
        recordedStatus: 'partial',
        recordedVerses: 2,
        totalVerses: 4,
        seed: 'Mark:pericope::2',
        groupSeed: 'Mark:14',
      }),
    ]);
    expect(result.current.byChapter.get(2)).toEqual([
      expect.objectContaining({ title: null, recordedStatus: 'none' }),
    ]);
  });

  it('draws a passage crossing chapters the same under both', async () => {
    const crossing = {
      pericopeNumber: '9',
      pericopeTitle: 'Jesus Before Pilate',
      section: null,
      verses: [...verses(14, 72, 72), ...verses(15, 1, 5)],
    };
    mockPericopes.mockResolvedValue([crossing]);
    const chapters = [chapter(1, 14), chapter(2, 15)];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    const [under14] = result.current.byChapter.get(1) ?? [];
    const [under15] = result.current.byChapter.get(2) ?? [];
    expect(under14).toMatchObject({
      seed: 'Mark:pericope::9',
      groupSeed: 'Mark:14',
    });
    expect(under15).toMatchObject({
      seed: under14?.seed,
      groupSeed: under14?.groupSeed,
    });
  });

  it('counts a submitted chapter as recorded and in peer check, and checks it past peer check', async () => {
    mockPericopes.mockImplementation(async (_book: number, ch: number) => [
      {
        pericopeNumber: String(ch),
        pericopeTitle: null,
        section: null,
        verses: verses(ch, 22, 25),
      },
    ]);
    const chapters = [
      chapter(1, 14, { workflowStage: 'peer_check' }),
      chapter(2, 15, { workflowStage: 'community_review' }),
    ];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.byChapter.get(1)).toEqual([
      expect.objectContaining({
        recordedStatus: 'recorded',
        recordedVerses: 4,
        submitted: true,
        peerChecked: false,
      }),
    ]);
    expect(result.current.byChapter.get(2)).toEqual([
      expect.objectContaining({
        recordedStatus: 'recorded',
        submitted: true,
        peerChecked: true,
      }),
    ]);
  });

  it('puts a passage crossing chapters in peer check, and checks it only once both pass', async () => {
    mockPericopes.mockResolvedValue([
      {
        pericopeNumber: '9',
        pericopeTitle: null,
        section: null,
        verses: [...verses(14, 72, 72), ...verses(15, 1, 5)],
      },
    ]);
    const chapters = [
      chapter(1, 14, { workflowStage: 'complete' }),
      chapter(2, 15, { workflowStage: 'peer_check' }),
    ];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    for (const id of [1, 2]) {
      expect(result.current.byChapter.get(id)).toEqual([
        expect.objectContaining({
          recordedStatus: 'recorded',
          submitted: true,
          peerChecked: false,
        }),
      ]);
    }
  });

  it.each([
    ['still in draft', [chapter(2, 15, { workflowStage: 'draft' })]],
    ['in another milestone', []],
  ])(
    'counts a crossing passage by chapter when the next is %s',
    async (_label, others) => {
      mockPericopes.mockResolvedValue([
        {
          pericopeNumber: '9',
          pericopeTitle: null,
          section: null,
          verses: [...verses(14, 72, 72), ...verses(15, 1, 5)],
        },
      ]);
      const chapters = [
        chapter(1, 14, { workflowStage: 'complete' }),
        ...others,
      ];

      const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

      await waitFor(() => expect(result.current.status).toBe('ready'));
      if (result.current.status !== 'ready') return;
      expect(result.current.byChapter.get(1)).toEqual([
        expect.objectContaining({
          recordedStatus: 'partial',
          recordedVerses: 1,
          totalVerses: 6,
          submitted: false,
          peerChecked: false,
        }),
      ]);
    },
  );

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
    expect(result.current.pericopes).toBe(false);
    expect(result.current.byChapter.get(1)).toEqual([
      expect.objectContaining({
        title: null,
        reference: 'Mark 14',
        verses: '1–72',
        anchorVerse: 1,
        recordedStatus: 'partial',
        recordedVerses: 5,
        totalVerses: 72,
        submitted: false,
        seed: 'Mark:14:chapter',
        groupSeed: 'Mark:14',
      }),
    ]);
    expect(mockPericopes).not.toHaveBeenCalled();
  });

  it('says it has no pericopes when the set has none for the book', async () => {
    mockPericopes.mockResolvedValue([]);
    const chapters = [chapter(1, 14), chapter(2, 15)];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.pericopes).toBe(false);
  });

  it('falls back to whole chapters when loading fails', async () => {
    mockSetId.mockRejectedValue(new Error('db'));
    const chapters = [chapter(1, 14)];

    const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.pericopes).toBe(false);
    expect(result.current.byChapter.get(1)).toEqual([
      expect.objectContaining({ key: 'chapter:1', reference: 'Mark 14' }),
    ]);
  });

  it.each([
    ['in peer check', 'peer_check', false],
    ['past peer check', 'advanced_check', true],
  ] as const)(
    'counts a whole chapter %s as recorded and submitted',
    async (_label, workflowStage, peerChecked) => {
      mockSetId.mockResolvedValue(null);
      const chapters = [
        chapter(1, 14, { workflowStage, completedVerses: 0, totalVerses: 72 }),
      ];

      const { result } = renderHook(() => useBookPassages(chapters, 9, 3));

      await waitFor(() => expect(result.current.status).toBe('ready'));
      if (result.current.status !== 'ready') return;
      expect(result.current.byChapter.get(1)).toEqual([
        expect.objectContaining({
          recordedStatus: 'recorded',
          recordedVerses: 72,
          submitted: true,
          peerChecked,
        }),
      ]);
    },
  );
});
