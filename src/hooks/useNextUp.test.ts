import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  draftingChapters,
  startedChapters,
  useNextUp,
  type NextUp,
} from './useNextUp';
import {
  coverageLookup,
  loadChapterPassages,
  type BookPassage,
} from './useBookPassages';
import {
  getDatabaseWriteMark,
  getMilestoneChapters,
  sameDatabaseWrites,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';
import type { MyWorkChapter } from '../types/db/types';
import {
  hasStartupMark,
  resetStartupTraceForTests,
} from '../utils/startupTrace';

/** Coming back to the screen: runs the latest focus effect again. */
let mockRefocus: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react');
    const [focus, setFocus] = React.useState(0);
    mockRefocus = () => setFocus((n: number) => n + 1);
    React.useEffect(effect, [effect, focus]);
  },
}));

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getDatabaseWriteMark: jest.fn(() => Promise.resolve(null)),
  sameDatabaseWrites: jest.fn(() => false),
  getMilestoneChapters: jest.fn(),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(() => null),
}));

let mockUnit = 'pericope';
jest.mock('./useDraftingUnit', () => ({
  useDraftingUnit: () => ({ draftingUnit: mockUnit }),
}));

let mockCoverages: { startChapter: number; endChapter: number }[] = [];
jest.mock('./useBookPassages', () => ({
  ...jest.requireActual('./useBookPassages'),
  coverageLookup: jest.fn(() => jest.fn(async () => mockCoverages)),
  loadChapterPassages: jest.fn(),
}));

const mockSetId = getProjectPericopeSetId as jest.Mock;
const mockLoad = loadChapterPassages as jest.Mock;
const mockStages = getMilestoneChapters as jest.Mock;
const mockUserId = parseUserId as jest.Mock;
const mockWriteMark = getDatabaseWriteMark as jest.Mock;
const mockSameWrites = sameDatabaseWrites as jest.Mock;

function chapter(
  id: number,
  overrides: Partial<MyWorkChapter> = {},
): MyWorkChapter {
  return {
    id,
    displayLabel: `Mark ${id}`,
    bookName: 'Mark',
    chapterNumber: id,
    workflowStage: 'draft',
    ownershipState: 'mine',
    completedVerses: 0,
    totalVerses: 20,
    projectId: 9,
    projectUnitId: 3,
    ...overrides,
  } as MyWorkChapter;
}

function passage(
  key: string,
  recordedStatus: BookPassage['recordedStatus'] = 'none',
): BookPassage {
  return {
    key,
    title: null,
    reference: key,
    verses: '1–5',
    anchorVerse: 1,
    recordedStatus,
    recordedVerses: 0,
    totalVerses: 5,
    submitted: false,
    peerChecked: false,
    seed: key,
    groupSeed: 'chapter',
  };
}

/** The hero's passage key, then the rest, for short assertions. */
function keys(nextUp: NextUp): [string | null, string[]] {
  if (nextUp.status !== 'ready') return [null, []];
  return [
    nextUp.hero?.passage.key ?? null,
    nextUp.after.map(p => p.passage.key),
  ];
}

describe('draftingChapters', () => {
  it('keeps the chapters I draft, in the order they came', () => {
    const one = chapter(1);
    const untouched = chapter(2, { workflowStage: 'not_started' });
    const peerCheck = chapter(3, { workflowStage: 'peer_check' });
    const someoneElses = chapter(4, { ownershipState: 'other' });

    expect(draftingChapters([one, untouched, peerCheck, someoneElses])).toEqual(
      [one, untouched],
    );
  });
});

describe('startedChapters', () => {
  it('keeps drafts with something recorded, worked on last first', () => {
    const older = chapter(1, {
      completedVerses: 3,
      lastActivityAt: '2026-10-01T10:00:00Z',
    });
    const newer = chapter(2, {
      completedVerses: 3,
      lastActivityAt: '2026-10-20T10:00:00Z',
    });
    const untouched = chapter(3);

    expect(startedChapters([older, untouched, newer])).toEqual([newer, older]);
  });

  it('keeps a draft with takes only on this phone, which the count lags', () => {
    const local = chapter(1);

    expect(startedChapters([local], new Set([1]))).toEqual([local]);
  });
});

describe('useNextUp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetId.mockResolvedValue(7);
    mockUserId.mockReturnValue(null);
    mockUnit = 'pericope';
    mockCoverages = [];
  });

  it('keeps going on a chapter recorded only on this phone', async () => {
    mockCoverages = [{ startChapter: 2, endChapter: 2 }];
    mockLoad.mockImplementation(async (c: MyWorkChapter) =>
      c.id === 1 ? [passage('1a')] : [passage('2a', 'partial')],
    );

    const chapters = [chapter(1), chapter(2)];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(keys(result.current)).toEqual(['2a', ['1a']]);
  });

  it('shows loading, not the old list, while the other unit loads', async () => {
    mockLoad.mockResolvedValue([passage('1a')]);
    const chapters = [chapter(1)];
    const { result, rerender } = renderHook(() => useNextUp(chapters));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    mockUnit = 'verse';
    rerender({});

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('works through whole chapters when recording verse by verse', async () => {
    mockUnit = 'verse';
    mockLoad.mockResolvedValue([passage('1a')]);

    const { result } = renderHook(() => useNextUp([chapter(1)]));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mockSetId).not.toHaveBeenCalled();
    expect(mockLoad.mock.calls[0]?.[1]).toBeNull();
  });

  it('keeps going on a part-recorded passage from the chapter worked on last', async () => {
    const first = chapter(1);
    const older = chapter(2, {
      completedVerses: 3,
      lastActivityAt: '2026-10-01T10:00:00Z',
    });
    const latest = chapter(3, {
      completedVerses: 3,
      lastActivityAt: '2026-10-20T10:00:00Z',
    });
    mockLoad.mockImplementation(async (c: MyWorkChapter) =>
      c.id === 1
        ? [passage('1a'), passage('1b')]
        : c.id === 2
        ? [passage('2a', 'partial')]
        : [passage('3a', 'recorded'), passage('3b', 'partial')],
    );

    const chapters = [first, older, latest];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(keys(result.current)).toEqual(['3b', ['1a', '1b', '2a']]);
    expect(mockLoad).toHaveBeenCalledTimes(3);
  });

  it('starts at the first unrecorded passage in book order, then the next four', async () => {
    mockLoad.mockImplementation(async (c: MyWorkChapter) =>
      c.id === 1
        ? [passage('1a', 'recorded'), passage('1b'), passage('1c')]
        : [passage(`${c.id}a`), passage(`${c.id}b`)],
    );

    const chapters = [chapter(1), chapter(2), chapter(3), chapter(4)];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(keys(result.current)).toEqual(['1b', ['1c', '2a', '2b', '3a']]);
    // The rail is full before the last chapter, so it isn't read.
    expect(mockLoad).toHaveBeenCalledTimes(3);
  });

  it('leaves out peer checks and fully recorded drafts', async () => {
    mockLoad.mockImplementation(async (c: MyWorkChapter) =>
      c.id === 1 ? [passage('1a', 'recorded')] : [passage(`${c.id}a`)],
    );

    const chapters = [
      chapter(1, { completedVerses: 20 }),
      chapter(2, { workflowStage: 'peer_check' }),
      chapter(3),
    ];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(keys(result.current)).toEqual(['3a', []]);
  });

  it('falls back to the whole chapter when its passages fail to load', async () => {
    mockLoad.mockRejectedValue(new Error('db closed'));

    const chapters = [chapter(1)];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(keys(result.current)).toEqual(['chapter:1', []]);
  });

  it('falls back to whole chapters when the pericope set fails to load', async () => {
    mockSetId.mockRejectedValue(new Error('db closed'));

    const chapters = [chapter(1)];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(keys(result.current)).toEqual(['chapter:1', []]);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('shows a passage that crosses chapters once', async () => {
    mockLoad.mockImplementation(async (c: MyWorkChapter) =>
      c.id === 1
        ? [passage('pericope::4'), passage('pericope::5')]
        : [passage('pericope::5'), passage('pericope::6')],
    );

    const chapters = [chapter(1), chapter(2)];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(keys(result.current)).toEqual([
      'pericope::4',
      ['pericope::5', 'pericope::6'],
    ]);
  });

  it('stops loading once unmounted', async () => {
    let finish: (passages: BookPassage[]) => void = () => {};
    mockLoad.mockReturnValue(
      new Promise<BookPassage[]>(resolve => {
        finish = resolve;
      }),
    );

    const chapters = [chapter(1), chapter(2)];
    const { result, unmount } = renderHook(() => useNextUp(chapters));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
    unmount();
    finish([passage('1a', 'recorded')]);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('has nothing to record, only to check, when I have nothing to draft', async () => {
    const peer = chapter(1, { workflowStage: 'peer_check' });
    const { result } = renderHook(() => useNextUp([peer]));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'ready',
        hero: null,
        after: [],
        checking: [
          expect.objectContaining({
            key: '1:chapter:1',
            chapter: peer,
            passage: expect.objectContaining({ reference: 'Mark 1' }),
          }),
        ],
      }),
    );
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('loads again, rather than staying empty, when my chapters arrive', async () => {
    let finish: (passages: BookPassage[]) => void = () => {};
    mockLoad.mockReturnValue(
      new Promise<BookPassage[]>(resolve => {
        finish = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ chapters }: { chapters: MyWorkChapter[] }) => useNextUp(chapters),
      { initialProps: { chapters: [] } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ chapters: [chapter(1)] });
    expect(result.current).toEqual({ status: 'loading' });

    finish([passage('1a')]);
    await waitFor(() => expect(keys(result.current)).toEqual(['1a', []]));
  });

  it('marks Next up ready for the launch trace only once chapters are read', async () => {
    resetStartupTraceForTests();
    mockLoad.mockResolvedValue([passage('1a')]);
    const { result, rerender } = renderHook(
      ({ chapters }: { chapters: MyWorkChapter[] }) => useNextUp(chapters),
      { initialProps: { chapters: [] } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(hasStartupMark('nextup_ready')).toBe(false);

    rerender({ chapters: [chapter(1)] });
    await waitFor(() => expect(keys(result.current)).toEqual(['1a', []]));
    expect(hasStartupMark('nextup_ready')).toBe(true);
  });

  it.each([
    ['a draft', chapter(1)],
    ['a peer check', chapter(1, { workflowStage: 'peer_check' })],
  ])(
    'never shows the empty pass for even one render once %s arrives',
    async (_label, arrived) => {
      mockLoad.mockResolvedValue([passage('1a')]);
      const renders: [number, NextUp['status']][] = [];
      const { result, rerender } = renderHook(
        ({ chapters }: { chapters: MyWorkChapter[] }) => {
          const nextUp = useNextUp(chapters);
          renders.push([chapters.length, nextUp.status]);
          return nextUp;
        },
        { initialProps: { chapters: [] as MyWorkChapter[] } },
      );
      await waitFor(() => expect(result.current.status).toBe('ready'));
      const before = renders.length;

      rerender({ chapters: [arrived] });
      await waitFor(() => expect(result.current.status).toBe('ready'));

      expect(renders[before]).toEqual([1, 'loading']);
    },
  );

  it.each([
    [
      'a whole multi-verse chapter as the only passage',
      'none',
      ['chapter:1', []],
    ],
    ['a fully recorded draft', 'recorded', [null, []]],
  ] as const)(
    'goes from loading straight to its final shape for %s',
    async (_label, status, shape) => {
      mockUnit = 'verse';
      mockLoad.mockResolvedValue([passage('chapter:1', status)]);
      const seen: string[] = [];
      const { result, rerender } = renderHook(
        ({ chapters }: { chapters: MyWorkChapter[] }) => {
          const nextUp = useNextUp(chapters);
          seen.push(JSON.stringify(keys(nextUp)) + nextUp.status);
          return nextUp;
        },
        { initialProps: { chapters: [] as MyWorkChapter[] } },
      );
      await waitFor(() => expect(result.current.status).toBe('ready'));
      const before = seen.length;

      rerender({ chapters: [chapter(1, { totalVerses: 25 })] });
      await waitFor(() => expect(keys(result.current)).toEqual(shape));

      const shapes = seen.slice(before);
      expect(new Set(shapes)).toEqual(
        new Set([`[null,[]]loading`, `${JSON.stringify(shape)}ready`]),
      );
    },
  );

  it('stays empty, without loading again, when every draft is recorded', async () => {
    mockLoad.mockResolvedValue([passage('1a', 'recorded')]);
    const { result, rerender } = renderHook(
      ({ chapters }: { chapters: MyWorkChapter[] }) => useNextUp(chapters),
      { initialProps: { chapters: [chapter(1)] } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ chapters: [chapter(1)] });
    expect(keys(result.current)).toEqual([null, []]);
    expect(result.current.status).toBe('ready');
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  });

  it("reads each chapter's stage from the milestone, not from this list", async () => {
    mockUserId.mockReturnValue(4);
    mockStages.mockResolvedValue([
      { bookName: 'Mark', chapterNumber: 14, workflowStage: 'draft' },
      { bookName: 'Mark', chapterNumber: 15, workflowStage: 'submitted' },
    ]);
    mockLoad.mockResolvedValue([passage('14a')]);

    const { result } = renderHook(() => useNextUp([chapter(14)]));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(mockStages).toHaveBeenCalledWith(3, 4);
    const stageOf = mockLoad.mock.calls[0][3] as (n: number) => string;
    expect(stageOf(14)).toBe('draft');
    expect(stageOf(15)).toBe('submitted');
  });

  describe('coming back to Home', () => {
    const connection = {};
    let changes = 0;

    beforeEach(() => {
      changes = 0;
      mockWriteMark.mockImplementation(() =>
        Promise.resolve({ connection, changes }),
      );
      mockSameWrites.mockImplementation(
        (a, b) =>
          a !== null &&
          b !== null &&
          a.connection === b.connection &&
          a.changes === b.changes,
      );
      mockLoad.mockResolvedValue([passage('1a')]);
    });

    async function readyOn(chapters: MyWorkChapter[]) {
      const hook = renderHook(() => useNextUp(chapters));
      await waitFor(() => expect(hook.result.current.status).toBe('ready'));
      return hook;
    }

    async function refocus() {
      await act(async () => {
        mockRefocus?.();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      });
    }

    it('keeps what it shows, without reading, when nothing was written', async () => {
      const { result } = await readyOn([chapter(1)]);
      const shown = result.current;

      await refocus();

      expect(mockLoad).toHaveBeenCalledTimes(1);
      expect(result.current).toBe(shown);
    });

    it('moves on after a take is recorded', async () => {
      const { result } = await readyOn([chapter(1)]);
      changes = 1;
      mockLoad.mockResolvedValue([passage('1a', 'recorded'), passage('1b')]);

      await refocus();

      await waitFor(() => expect(keys(result.current)).toEqual(['1b', []]));
      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('reads the new chapters when My Work hands it a new list', async () => {
      const { result, rerender } = renderHook(
        ({ chapters }: { chapters: MyWorkChapter[] }) => useNextUp(chapters),
        { initialProps: { chapters: [chapter(1)] } },
      );
      await waitFor(() => expect(keys(result.current)).toEqual(['1a', []]));
      mockLoad.mockResolvedValue([passage('2a')]);

      rerender({ chapters: [chapter(2)] });

      await waitFor(() => expect(keys(result.current)).toEqual(['2a', []]));
      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('reads again for another account', async () => {
      await readyOn([chapter(1)]);
      mockUserId.mockReturnValue(5);

      await refocus();

      await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
    });

    it('reads again when the write count is unreadable', async () => {
      await readyOn([chapter(1)]);
      mockWriteMark.mockResolvedValue(null);

      await refocus();

      await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
    });

    it('reads again after its passages failed to load', async () => {
      mockLoad.mockRejectedValueOnce(new Error('busy'));
      await readyOn([chapter(1)]);

      await refocus();

      await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
    });

    it("reads again after a chapter's stages failed to load", async () => {
      mockUserId.mockReturnValue(4);
      mockStages.mockRejectedValueOnce(new Error('busy')).mockResolvedValue([]);
      await readyOn([chapter(1)]);

      await refocus();

      await waitFor(() => expect(mockStages).toHaveBeenCalledTimes(2));
    });

    it('reads again after its recorded ranges failed to load', async () => {
      (coverageLookup as jest.Mock).mockImplementationOnce(
        (_unit: number, onError?: () => void) =>
          jest.fn(async () => {
            onError?.();
            return [];
          }),
      );
      await readyOn([chapter(1)]);

      await refocus();

      await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
    });

    it('reads again after a write that landed while it was loading', async () => {
      let release!: () => void;
      mockLoad.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            release = () => resolve([passage('1a')]);
          }),
      );
      const chapters = [chapter(1)];
      const { result } = renderHook(() => useNextUp(chapters));
      await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));
      changes = 1;
      await act(async () => release());
      await waitFor(() => expect(result.current.status).toBe('ready'));

      await refocus();

      await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
    });
  });
});
