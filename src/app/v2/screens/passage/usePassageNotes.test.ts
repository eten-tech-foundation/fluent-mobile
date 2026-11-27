import { act, renderHook } from '@testing-library/react-native';
import type { TranslationNotesLoadState } from '../../../../hooks/useTranslationNotesForUnit';
import { clearPassageResourceReuse } from '../../../../services/passageResourceReuse';
import { usePassageNotes } from './usePassageNotes';
import type { Ready } from './ready';

let mockState: TranslationNotesLoadState = { status: 'loading' };
let mockConnectivity = { isOnline: true, hasResolved: true };
const mockRetry = jest.fn();

jest.mock('../../../../hooks/useConnectivity', () => ({
  useConnectivity: () => mockConnectivity,
}));

jest.mock('../../../../hooks/useTranslationNotesForUnit', () => ({
  useTranslationNotesForUnit: () => ({ state: mockState, retry: mockRetry }),
}));

jest.mock('./noteMatch', () => ({
  matchNotes: (_verses: unknown, notes: { id: string }[]) => ({
    notes: notes.map(n => ({ id: n.id })),
    chips: new Map(),
  }),
}));

const passage = {
  assignment: {
    projectId: 7,
    bookCode: 'MRK',
    chapterNumber: 14,
    sourceLanguageCode: 'eng',
  },
  verses: [{ chapterNumber: 14, verseNumber: 1 }],
} as unknown as Ready;

const ready = (
  over: Partial<Extract<TranslationNotesLoadState, { status: 'ready' }>> = {},
): TranslationNotesLoadState => ({
  status: 'ready',
  notes: [{ id: 'a', title: 'A', body: 'for A' }],
  failedRefs: [],
  unavailableOfflineRefs: [],
  ...over,
});

describe('usePassageNotes', () => {
  beforeEach(() => {
    mockRetry.mockReset();
    mockConnectivity = { isOnline: true, hasResolved: true };
  });

  it("keeps notes through the same account's reload, never into another account's", async () => {
    mockState = ready();
    const { result, rerender } = await renderHook(
      ({ userId }: { userId: number }) =>
        usePassageNotes(passage, userId, true),
      { initialProps: { userId: 5 } },
    );
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    mockState = { status: 'loading' };
    await rerender({ userId: 5 });
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    await rerender({ userId: 6 });
    expect(result.current.notes).toEqual([]);
  });

  it('does not keep notes into another project, book or passage', async () => {
    mockState = ready();
    const { result, rerender } = await renderHook(
      ({ p }: { p: Ready }) => usePassageNotes(p, 5, true),
      { initialProps: { p: passage } },
    );
    expect(result.current.notes).toEqual([{ id: 'a' }]);
    mockState = { status: 'error', message: 'nope', failedRefs: [] };

    await rerender({
      p: {
        ...passage,
        assignment: { ...passage.assignment, projectId: 8 },
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);

    await rerender({
      p: {
        ...passage,
        assignment: { ...passage.assignment, bookCode: 'LUK' },
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);

    await rerender({
      p: {
        ...passage,
        verses: [{ chapterNumber: 14, verseNumber: 2 }],
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);
  });

  it('does not keep notes into another source language', async () => {
    mockState = ready();
    const { result, rerender } = await renderHook(
      ({ p }: { p: Ready }) => usePassageNotes(p, 5, true),
      { initialProps: { p: passage } },
    );
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    await rerender({
      p: {
        ...passage,
        assignment: { ...passage.assignment, sourceLanguageCode: 'fra' },
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);
  });

  it("doesn't call a passage's fresh load a retry after switching away mid-retry", async () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    mockRetry.mockImplementation(() => {
      mockState = { status: 'loading' };
    });
    const other = {
      ...passage,
      assignment: { ...passage.assignment, projectId: 8 },
    } as Ready;
    const { result, rerender } = await renderHook(
      ({ p }: { p: Ready }) => usePassageNotes(p, 5, true),
      { initialProps: { p: passage } },
    );
    await act(() => result.current.retry());
    expect(result.current.status).toBe('retrying');

    await rerender({ p: other });
    expect(result.current.status).toBe('loading');
    await rerender({ p: passage });
    expect(result.current.status).toBe('loading');
  });

  it('asks once for two taps in the same frame', async () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    const { result } = await renderHook(() =>
      usePassageNotes(passage, 5, true),
    );
    await act(() => {
      result.current.retry();
      result.current.retry();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('does not keep notes from before a grant clear when the reload fails', async () => {
    mockState = ready();
    const { result } = await renderHook(() =>
      usePassageNotes(passage, 5, true),
    );
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    await act(() => {
      clearPassageResourceReuse('5');
    });
    expect(result.current.notes).toEqual([]);
  });

  it.each<[string, TranslationNotesLoadState, string]>([
    ['loading', { status: 'loading' }, 'loading'],
    ['an empty load', ready({ notes: [] }), 'empty'],
    ['a full load', ready(), 'complete'],
    [
      'a partial load',
      ready({ failedRefs: [{ chapterNumber: 14, verseNumber: 1 }] }),
      'partial',
    ],
    [
      'a failed load',
      { status: 'error', message: 'nope', failedRefs: [] },
      'failed',
    ],
  ])('reports %s as %s', async (_name, state, status) => {
    mockState = state;
    const { result } = await renderHook(() =>
      usePassageNotes(passage, 5, true),
    );
    expect(result.current.status).toBe(status);
  });

  it('is idle until enabled', async () => {
    mockState = ready();
    const { result } = await renderHook(() =>
      usePassageNotes(passage, 5, false),
    );
    expect(result.current.status).toBe('idle');
  });

  it('calls out offline verses only once connectivity is known', async () => {
    mockState = ready({
      unavailableOfflineRefs: [{ chapterNumber: 14, verseNumber: 1 }],
    });
    mockConnectivity = { isOnline: false, hasResolved: false };
    const { result, rerender } = await renderHook(() =>
      usePassageNotes(passage, 5, true),
    );
    expect(result.current.status).toBe('loading');

    mockConnectivity = { isOnline: false, hasResolved: true };
    await rerender({});
    expect(result.current.status).toBe('offline');
  });

  it('retries once at a time, and reports the retry until it settles', async () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    mockRetry.mockImplementation(() => {
      mockState = { status: 'loading' };
    });
    const { result, rerender } = await renderHook(() =>
      usePassageNotes(passage, 5, true),
    );

    await act(() => result.current.retry());
    expect(result.current.status).toBe('retrying');
    await act(() => result.current.retry());
    expect(mockRetry).toHaveBeenCalledTimes(1);

    mockState = ready();
    await rerender({});
    expect(result.current.status).toBe('complete');

    // A later reload that isn't a retry reads as plain loading.
    mockState = { status: 'loading' };
    await rerender({});
    expect(result.current.status).toBe('loading');
  });

  it('does not retry before the player asks for notes', async () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    const { result } = await renderHook(() =>
      usePassageNotes(passage, 5, false),
    );
    await act(() => result.current.retry());
    expect(mockRetry).not.toHaveBeenCalled();
  });
});
