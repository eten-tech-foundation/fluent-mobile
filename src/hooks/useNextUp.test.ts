import { renderHook, waitFor } from '@testing-library/react-native';
import {
  draftingChapters,
  startedChapters,
  useNextUp,
  type NextUp,
} from './useNextUp';
import { loadChapterPassages, type BookPassage } from './useBookPassages';
import { getProjectPericopeSetId } from '../db/repository';
import type { MyWorkChapter } from '../types/db/types';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    require('react').useEffect(effect, [effect]),
}));

jest.mock('../db/repository', () => ({
  getProjectPericopeSetId: jest.fn(),
}));

jest.mock('../db/queries', () => ({}));

jest.mock('./useBookPassages', () => ({
  ...jest.requireActual('./useBookPassages'),
  coverageLookup: jest.fn(() => jest.fn()),
  loadChapterPassages: jest.fn(),
}));

const mockSetId = getProjectPericopeSetId as jest.Mock;
const mockLoad = loadChapterPassages as jest.Mock;

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
});

describe('useNextUp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetId.mockResolvedValue(7);
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

  it('is empty when I have nothing to draft', async () => {
    const chapters = [chapter(1, { workflowStage: 'peer_check' })];
    const { result } = renderHook(() => useNextUp(chapters));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'ready',
        hero: null,
        after: [],
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
});
