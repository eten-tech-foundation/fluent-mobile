import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTranslationNotesForUnit } from './useTranslationNotesForUnit';
import type { TranslationNotesLoadState as TranslationNotesLoadStateForTest } from './useTranslationNotesForUnit';
import {
  loadTranslationNotesForUnit,
  setTranslationNotesLoadFailureForTests,
} from '../services/translationNotes';
import { clearPassageResourceReuse } from '../services/passageResourceReuse';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../constants/messages';
import { TranslationNoteItem } from '../types/resources/translationNotes';

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

describe('useTranslationNotesForUnit', () => {
  afterEach(() => {
    setTranslationNotesLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('loads notes for units that have TN content', async () => {
    mockLoad.mockResolvedValue(SAMPLE_NOTES);

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
      verseRefs: [{ chapterNumber: 14, verseNumber: 1 }],
      languageCode: undefined,
      refresh: false,
    });
  });

  it('exposes an error state that retry can clear', async () => {
    mockLoad.mockRejectedValueOnce(new Error('boom'));
    mockLoad.mockResolvedValueOnce(SAMPLE_NOTES);

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
      expect.objectContaining({ refresh: true }),
    );
  });

  it("never shows account A's notes to account B on the same mounted hook", async () => {
    let answerB!: (notes: TranslationNoteItem[]) => void;
    mockLoad.mockResolvedValueOnce(SAMPLE_NOTES).mockReturnValueOnce(
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
      answerB(theirs);
    });
    expect(result.current.state).toEqual({ status: 'ready', notes: theirs });
  });

  it('drops a response that arrives after a grant clear and loads again', async () => {
    const pending: Array<(notes: TranslationNoteItem[]) => void> = [];
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
      pending[0]?.(SAMPLE_NOTES);
    });
    expect(result.current.state.status).toBe('loading');

    const fresh: TranslationNoteItem[] = [
      { id: 'fresh', title: 'Fresh', body: 'after clear' },
    ];
    await act(async () => {
      pending[1]?.(fresh);
    });
    expect(result.current.state).toEqual({ status: 'ready', notes: fresh });
  });
});
