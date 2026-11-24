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

  it("keeps notes through the same account's reload, never into another account's", () => {
    mockState = ready();
    const { result, rerender } = renderHook(
      ({ userId }: { userId: number }) =>
        usePassageNotes(passage, userId, true),
      { initialProps: { userId: 5 } },
    );
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    mockState = { status: 'loading' };
    rerender({ userId: 5 });
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    rerender({ userId: 6 });
    expect(result.current.notes).toEqual([]);
  });

  it('does not keep notes into another project, book or passage', () => {
    mockState = ready();
    const { result, rerender } = renderHook(
      ({ p }: { p: Ready }) => usePassageNotes(p, 5, true),
      { initialProps: { p: passage } },
    );
    expect(result.current.notes).toEqual([{ id: 'a' }]);
    mockState = { status: 'error', message: 'nope', failedRefs: [] };

    rerender({
      p: {
        ...passage,
        assignment: { ...passage.assignment, projectId: 8 },
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);

    rerender({
      p: {
        ...passage,
        assignment: { ...passage.assignment, bookCode: 'LUK' },
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);

    rerender({
      p: {
        ...passage,
        verses: [{ chapterNumber: 14, verseNumber: 2 }],
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);
  });

  it('does not keep notes into another source language', () => {
    mockState = ready();
    const { result, rerender } = renderHook(
      ({ p }: { p: Ready }) => usePassageNotes(p, 5, true),
      { initialProps: { p: passage } },
    );
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    rerender({
      p: {
        ...passage,
        assignment: { ...passage.assignment, sourceLanguageCode: 'fra' },
      } as Ready,
    });
    expect(result.current.notes).toEqual([]);
  });

  it("doesn't call a passage's fresh load a retry after switching away mid-retry", () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    mockRetry.mockImplementation(() => {
      mockState = { status: 'loading' };
    });
    const other = {
      ...passage,
      assignment: { ...passage.assignment, projectId: 8 },
    } as Ready;
    const { result, rerender } = renderHook(
      ({ p }: { p: Ready }) => usePassageNotes(p, 5, true),
      { initialProps: { p: passage } },
    );
    act(() => result.current.retry());
    expect(result.current.status).toBe('retrying');

    rerender({ p: other });
    expect(result.current.status).toBe('loading');
    rerender({ p: passage });
    expect(result.current.status).toBe('loading');
  });

  it('asks once for two taps in the same frame', () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    const { result } = renderHook(() => usePassageNotes(passage, 5, true));
    act(() => {
      result.current.retry();
      result.current.retry();
    });
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('does not keep notes from before a grant clear when the reload fails', () => {
    mockState = ready();
    const { result } = renderHook(() => usePassageNotes(passage, 5, true));
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    act(() => {
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
  ])('reports %s as %s', (_name, state, status) => {
    mockState = state;
    const { result } = renderHook(() => usePassageNotes(passage, 5, true));
    expect(result.current.status).toBe(status);
  });

  it('is idle until enabled', () => {
    mockState = ready();
    const { result } = renderHook(() => usePassageNotes(passage, 5, false));
    expect(result.current.status).toBe('idle');
  });

  it('calls out offline verses only once connectivity is known', () => {
    mockState = ready({
      unavailableOfflineRefs: [{ chapterNumber: 14, verseNumber: 1 }],
    });
    mockConnectivity = { isOnline: false, hasResolved: false };
    const { result, rerender } = renderHook(() =>
      usePassageNotes(passage, 5, true),
    );
    expect(result.current.status).toBe('loading');

    mockConnectivity = { isOnline: false, hasResolved: true };
    rerender({});
    expect(result.current.status).toBe('offline');
  });

  it('retries once at a time, and reports the retry until it settles', () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    mockRetry.mockImplementation(() => {
      mockState = { status: 'loading' };
    });
    const { result, rerender } = renderHook(() =>
      usePassageNotes(passage, 5, true),
    );

    act(() => result.current.retry());
    expect(result.current.status).toBe('retrying');
    act(() => result.current.retry());
    expect(mockRetry).toHaveBeenCalledTimes(1);

    mockState = ready();
    rerender({});
    expect(result.current.status).toBe('complete');

    // A later reload that isn't a retry reads as plain loading.
    mockState = { status: 'loading' };
    rerender({});
    expect(result.current.status).toBe('loading');
  });

  it('does not retry before the player asks for notes', () => {
    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    const { result } = renderHook(() => usePassageNotes(passage, 5, false));
    act(() => result.current.retry());
    expect(mockRetry).not.toHaveBeenCalled();
  });
});
