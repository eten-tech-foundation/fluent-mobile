import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTranslationQuestionsForUnit } from './useTranslationQuestionsForUnit';
import {
  loadTranslationQuestionsForUnit,
  setTranslationQuestionsLoadFailureForTests,
} from '../services/translationQuestions';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../constants/messages';
import { getMockTranslationQuestions } from '../mocks/resources/translationQuestionsMock';

jest.mock('../services/translationQuestions', () => {
  const actual = jest.requireActual('../services/translationQuestions');
  return {
    ...actual,
    loadTranslationQuestionsForUnit: jest.fn(),
  };
});

const mockLoad = loadTranslationQuestionsForUnit as jest.MockedFunction<
  typeof loadTranslationQuestionsForUnit
>;

describe('useTranslationQuestionsForUnit', () => {
  afterEach(() => {
    setTranslationQuestionsLoadFailureForTests(false);
    mockLoad.mockReset();
  });

  it('loads questions for units that have TQ content', async () => {
    mockLoad.mockResolvedValue(getMockTranslationQuestions(10, 2));

    const { result } = renderHook(() =>
      useTranslationQuestionsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.questions.length).toBeGreaterThan(0);
    expect(mockLoad).toHaveBeenCalledWith({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 2,
      languageCode: undefined,
    });
  });

  it('exposes an error state that retry can clear', async () => {
    mockLoad.mockRejectedValueOnce(new Error('boom'));
    mockLoad.mockResolvedValueOnce(getMockTranslationQuestions(10, 2));

    const { result } = renderHook(() =>
      useTranslationQuestionsForUnit({
        projectId: 7,
        bookCode: 'MRK',
        chapterNumber: 14,
        verseNumber: 2,
      }),
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    if (result.current.state.status !== 'error') {
      throw new Error('expected error state');
    }
    expect(result.current.state.message).toBe(TRANSLATION_QUESTIONS_LOAD_ERROR);

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('does not show the previous unit while the next load is still pending', async () => {
    mockLoad.mockResolvedValue(getMockTranslationQuestions(10, 2));

    const { result, rerender } = renderHook(
      ({
        projectId,
        bookCode,
        chapterNumber,
        verseNumber,
      }: {
        projectId: number | null;
        bookCode: string;
        chapterNumber: number;
        verseNumber: number;
      }) =>
        useTranslationQuestionsForUnit({
          projectId,
          bookCode,
          chapterNumber,
          verseNumber,
        }),
      {
        initialProps: {
          projectId: 7,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 2,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.questions.length).toBeGreaterThan(0);

    let resolveNextLoad!: (
      questions: Awaited<ReturnType<typeof loadTranslationQuestionsForUnit>>,
    ) => void;
    const pendingLoad = new Promise<
      Awaited<ReturnType<typeof loadTranslationQuestionsForUnit>>
    >(resolve => {
      resolveNextLoad = resolve;
    });
    mockLoad.mockReturnValueOnce(pendingLoad);

    rerender({
      projectId: 7,
      bookCode: 'MRK',
      chapterNumber: 14,
      verseNumber: 1,
    });

    expect(result.current.state.status).toBe('loading');

    await act(async () => {
      resolveNextLoad([]);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.questions).toEqual([]);
  });
});
