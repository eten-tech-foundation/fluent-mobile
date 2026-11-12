import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTranslationNotesForUnit } from './useTranslationNotesForUnit';
import type { TranslationNotesLoadState as TranslationNotesLoadStateForTest } from './useTranslationNotesForUnit';
import {
  loadTranslationNotesForUnit,
  setTranslationNotesLoadFailureForTests,
  type LoadTranslationNotesParams,
  type TranslationNotesLoadResult,
} from '../services/translationNotes';
import { clearPassageResourceReuse } from '../services/passageResourceReuse';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../constants/messages';
import { TranslationNoteItem } from '../types/resources/translationNotes';
import type { ResourceVerseRef } from '../utils/loadResourcesForVerseRange';

jest.mock('../services/storage', () => ({
  getActiveUserId: () => '',
}));

jest.mock('../services/translationNotes', () => {
  const actual = jest.requireActual('../services/translationNotes');
  return {
    ...actual,
    loadTranslationNotesForUnit: jest.fn(),
  };
});

const mockLoad = loadTranslationNotesForUnit as jest.MockedFunction<
  typeof loadTranslationNotesForUnit
>;

// Fixed fixture — this suite only checks that notes are present, not their
// specific content, so a single hardcoded note is enough.
const SAMPLE_NOTES: TranslationNoteItem[] = [
  {
    id: 'tn-10-1-1',
    title: 'connecting word',
    body: 'This phrase connects the current verse to the previous one.',
  },
];

const V1: ResourceVerseRef = { chapterNumber: 14, verseNumber: 1 };

/** A load where every ref succeeded with `notes` on the first. */
function loaded(
  notes: TranslationNoteItem[],
  refs: ResourceVerseRef[] = [V1],
): TranslationNotesLoadResult {
  const notesByRef: Record<string, TranslationNoteItem[]> = {};
  refs.forEach((r, i) => {
    notesByRef[`${r.chapterNumber}:${r.verseNumber}`] = i === 0 ? notes : [];
  });
  return {
    notes,
    refs,
    succeededRefs: refs,
    failedRefs: [],
    unavailableOfflineRefs: [],
    notesByRef,
  };
}

function note(verseNumber: number): TranslationNoteItem {
  return {
    id: `n${verseNumber}`,
    title: `v${verseNumber}`,
    body: 'body',
    verse: { chapterNumber: 14, verseNumber },
  };
}

/** Verses 1-3 asked; `ok` loaded with one note each, the rest failed. */
function partial(ok: number[], asked = [1, 2, 3]): TranslationNotesLoadResult {
  const refs = asked.map(v => ({ chapterNumber: 14, verseNumber: v }));
  const notesByRef: Record<string, TranslationNoteItem[]> = {};
  ok.forEach(v => {
    notesByRef[`14:${v}`] = [note(v)];
  });
  return {
    notes: ok.map(note),
    refs,
    succeededRefs: refs.filter(r => ok.includes(r.verseNumber)),
    failedRefs: refs.filter(r => !ok.includes(r.verseNumber)),
    unavailableOfflineRefs: [],
    notesByRef,
  };
}

const READY_EMPTY_SETS = { failedRefs: [], unavailableOfflineRefs: [] };

describe('useTranslationNotesForUnit', () => {
  afterEach(() => {
    setTranslationNotesLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('loads notes for units that have TN content', async () => {
    mockLoad.mockResolvedValue(loaded(SAMPLE_NOTES));

    const { result } = renderHook(() =>
      useTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.notes.length).toBeGreaterThan(0);
    expect(mockLoad).toHaveBeenCalledWith({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 1,
      verseRefs: [V1],
      languageCode: undefined,
      refresh: false,
      signal: expect.any(AbortSignal),
    });
  });

  it('exposes an error state that retry can clear', async () => {
    mockLoad.mockRejectedValueOnce(new Error('boom'));
    mockLoad.mockResolvedValueOnce(loaded(SAMPLE_NOTES));

    const { result } = renderHook(() =>
      useTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    if (result.current.state.status !== 'error') {
      throw new Error('expected error state');
    }
    expect(result.current.state.message).toBe(TRANSLATION_NOTES_LOAD_ERROR);

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(mockLoad).toHaveBeenLastCalledWith(
      expect.objectContaining({ refresh: true, verseRefs: [V1] }),
    );
  });

  it("never shows account A's notes to account B on the same mounted hook", async () => {
    let answerB!: (result: TranslationNotesLoadResult) => void;
    mockLoad.mockResolvedValueOnce(loaded(SAMPLE_NOTES)).mockReturnValueOnce(
      new Promise(resolve => {
        answerB = resolve;
      }),
    );
    const unit = {
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 1,
    };
    const seenByB: TranslationNotesLoadStateForTest[] = [];
    const { result, rerender } = renderHook(
      (props: { userId: number }) => {
        const out = useTranslationNotesForUnit({ ...unit, ...props });
        if (props.userId === 6) seenByB.push(out.state);
        return out;
      },
      { initialProps: { userId: 5 } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    rerender({ userId: 6 });
    expect(seenByB.length).toBeGreaterThan(0);
    expect(seenByB.every(state => state.status === 'loading')).toBe(true);
    const theirs: TranslationNoteItem[] = [
      { id: 'b', title: 'B', body: 'for B' },
    ];
    await act(async () => {
      answerB(loaded(theirs));
    });
    expect(result.current.state).toEqual({
      status: 'ready',
      notes: theirs,
      ...READY_EMPTY_SETS,
    });
  });

  it('drops a response that arrives after a grant clear and loads again', async () => {
    const pending: Array<(result: TranslationNotesLoadResult) => void> = [];
    mockLoad.mockImplementation(
      () =>
        new Promise(resolve => {
          pending.push(resolve);
        }),
    );
    const { result } = renderHook(() =>
      useTranslationNotesForUnit({
        projectId: 7,
        userId: 5,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    );
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(1));

    act(() => {
      clearPassageResourceReuse('5');
    });
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));

    await act(async () => {
      pending[0]?.(loaded(SAMPLE_NOTES));
    });
    expect(result.current.state.status).toBe('loading');

    const fresh: TranslationNoteItem[] = [
      { id: 'fresh', title: 'Fresh', body: 'after clear' },
    ];
    await act(async () => {
      pending[1]?.(loaded(fresh));
    });
    expect(result.current.state).toEqual({
      status: 'ready',
      notes: fresh,
      ...READY_EMPTY_SETS,
    });
  });

  describe('partial failures (#901)', () => {
    const unit = {
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 1,
      verseNumbers: [1, 2, 3],
    };

    it('shows the verses that loaded and lists the ones that failed', async () => {
      mockLoad.mockResolvedValueOnce(partial([1, 3]));
      const { result } = renderHook(() => useTranslationNotesForUnit(unit));

      await waitFor(() => expect(result.current.state.status).toBe('ready'));
      expect(result.current.state).toEqual({
        status: 'ready',
        notes: [note(1), note(3)],
        failedRefs: [{ chapterNumber: 14, verseNumber: 2 }],
        unavailableOfflineRefs: [],
      });
    });

    it('retries only the failed verses and keeps the loaded ones', async () => {
      mockLoad
        .mockResolvedValueOnce(partial([1]))
        .mockResolvedValueOnce(partial([2], [2, 3]));
      const { result } = renderHook(() => useTranslationNotesForUnit(unit));
      await waitFor(() => expect(result.current.state.status).toBe('ready'));

      await act(async () => {
        await result.current.retry();
      });

      expect(mockLoad).toHaveBeenLastCalledWith(
        expect.objectContaining({
          refresh: true,
          verseRefs: [
            { chapterNumber: 14, verseNumber: 2 },
            { chapterNumber: 14, verseNumber: 3 },
          ],
        }),
      );
      expect(result.current.state).toEqual({
        status: 'ready',
        notes: [note(1), note(2)],
        failedRefs: [{ chapterNumber: 14, verseNumber: 3 }],
        unavailableOfflineRefs: [],
      });
    });

    it('is an error when every verse failed, and retry asks for all of them', async () => {
      mockLoad
        .mockResolvedValueOnce(partial([]))
        .mockResolvedValueOnce(partial([1, 2, 3]));
      const { result } = renderHook(() => useTranslationNotesForUnit(unit));

      await waitFor(() => expect(result.current.state.status).toBe('error'));
      expect(result.current.state).toMatchObject({
        failedRefs: partial([]).refs,
      });

      await act(async () => {
        await result.current.retry();
      });
      expect(mockLoad).toHaveBeenLastCalledWith(
        expect.objectContaining({ verseRefs: partial([]).refs }),
      );
      expect(result.current.state).toMatchObject({
        status: 'ready',
        notes: [note(1), note(2), note(3)],
        failedRefs: [],
      });
    });
  });

  it("never retries another unit's failed verses (#901)", async () => {
    mockLoad
      .mockResolvedValueOnce(partial([1, 2]))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(
        loaded([note(5)], [{ chapterNumber: 15, verseNumber: 5 }]),
      );
    const { result, rerender } = renderHook(
      (props: { chapterNumber: number; verseNumbers: number[] }) =>
        useTranslationNotesForUnit({
          projectId: 7,
          bookCode: 'MRK',
          verseNumber: props.verseNumbers[0]!,
          ...props,
        }),
      { initialProps: { chapterNumber: 14, verseNumbers: [1, 2, 3] } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    rerender({ chapterNumber: 15, verseNumbers: [5] });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    await act(async () => {
      await result.current.retry();
    });

    expect(mockLoad).toHaveBeenLastCalledWith(
      expect.objectContaining({
        verseRefs: [{ chapterNumber: 15, verseNumber: 5 }],
      }),
    );
    expect(result.current.state).toMatchObject({
      status: 'ready',
      notes: [note(5)],
    });
  });

  it('cancels a load still running when retry starts another (#901)', async () => {
    const signals: AbortSignal[] = [];
    mockLoad.mockImplementation((params: LoadTranslationNotesParams) => {
      signals.push(params.signal!);
      return new Promise(() => {});
    });
    const { result } = renderHook(() =>
      useTranslationNotesForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 1,
      }),
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    act(() => {
      void result.current.retry();
    });

    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  it('cancels the old load when the unit changes and on unmount (#901)', async () => {
    const signals: AbortSignal[] = [];
    mockLoad.mockImplementation((params: LoadTranslationNotesParams) => {
      signals.push(params.signal!);
      return new Promise(() => {});
    });
    const { rerender, unmount } = renderHook(
      (props: { chapterNumber: number }) =>
        useTranslationNotesForUnit({
          projectId: 7,
          bookCode: 'MRK',
          verseNumber: 1,
          ...props,
        }),
      { initialProps: { chapterNumber: 14 } },
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    rerender({ chapterNumber: 15 });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);

    unmount();
    expect(signals[1]!.aborted).toBe(true);
  });
});
