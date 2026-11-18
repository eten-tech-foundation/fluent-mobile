import { act, renderHook } from '@testing-library/react-native';
import type { TranslationNotesLoadState } from '../../../../hooks/useTranslationNotesForUnit';
import { clearPassageResourceReuse } from '../../../../services/passageResourceReuse';
import { usePassageNotes } from './usePassageNotes';
import type { Ready } from './ready';

let mockState: TranslationNotesLoadState = { status: 'loading' };

jest.mock('../../../../hooks/useConnectivity', () => ({
  useConnectivity: () => ({ isOnline: true, hasResolved: true }),
}));

jest.mock('../../../../hooks/useTranslationNotesForUnit', () => ({
  useTranslationNotesForUnit: () => ({ state: mockState, retry: jest.fn() }),
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

describe('usePassageNotes', () => {
  it("keeps notes through the same account's reload, never into another account's", () => {
    mockState = {
      status: 'ready',
      notes: [{ id: 'a', title: 'A', body: 'for A' }],
      failedRefs: [],
      unavailableOfflineRefs: [],
    };
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

  it('does not keep notes from before a grant clear when the reload fails', () => {
    mockState = {
      status: 'ready',
      notes: [{ id: 'a', title: 'A', body: 'for A' }],
      failedRefs: [],
      unavailableOfflineRefs: [],
    };
    const { result } = renderHook(() => usePassageNotes(passage, 5, true));
    expect(result.current.notes).toEqual([{ id: 'a' }]);

    mockState = { status: 'error', message: 'nope', failedRefs: [] };
    act(() => {
      clearPassageResourceReuse('5');
    });
    expect(result.current.notes).toEqual([]);
  });
});
