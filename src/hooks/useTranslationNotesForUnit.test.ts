import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTranslationNotesForUnit } from './useTranslationNotesForUnit';
import {
  loadTranslationNotesForUnit,
  setTranslationNotesLoadFailureForTests,
} from '../services/translationNotes';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../constants/messages';
import { TranslationNoteItem } from '../types/resources/translationNotes';

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
      languageCode: undefined,
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
  });
});
