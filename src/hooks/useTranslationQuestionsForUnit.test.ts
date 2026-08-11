import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTranslationQuestionsForUnit } from './useTranslationQuestionsForUnit';
import {
  loadTranslationQuestionsForUnit,
  setMockTranslationQuestionsLoadFailure,
} from '../mocks/resources/translationQuestionsMock';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../constants/messages';

jest.mock('../mocks/resources/translationQuestionsMock', () => {
  const actual = jest.requireActual(
    '../mocks/resources/translationQuestionsMock',
  );
  return {
    ...actual,
    loadTranslationQuestionsForUnit: jest.fn(
      actual.loadTranslationQuestionsForUnit,
    ),
  };
});

const mockLoad = loadTranslationQuestionsForUnit as jest.MockedFunction<
  typeof loadTranslationQuestionsForUnit
>;

describe('useTranslationQuestionsForUnit', () => {
  afterEach(() => {
    setMockTranslationQuestionsLoadFailure(false);
    mockLoad.mockReset();
    mockLoad.mockImplementation(
      jest.requireActual('../mocks/resources/translationQuestionsMock')
        .loadTranslationQuestionsForUnit,
    );
  });

  it('loads mock questions for units that have TQ content', async () => {
    const { result } = renderHook(() => useTranslationQuestionsForUnit(10, 2));

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready state');
    }
    expect(result.current.state.questions.length).toBeGreaterThan(0);
  });

  it('exposes an error state that retry can clear', async () => {
    setMockTranslationQuestionsLoadFailure(true);
    const { result } = renderHook(() => useTranslationQuestionsForUnit(10, 2));

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    if (result.current.state.status !== 'error') {
      throw new Error('expected error state');
    }
    expect(result.current.state.message).toBe(TRANSLATION_QUESTIONS_LOAD_ERROR);

    setMockTranslationQuestionsLoadFailure(false);
    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('does not show the previous unit while the next load is still pending', async () => {
    const { result, rerender } = renderHook(
      ({
        chapterId,
        verseNumber,
      }: {
        chapterId: number;
        verseNumber: number;
      }) => useTranslationQuestionsForUnit(chapterId, verseNumber),
      { initialProps: { chapterId: 10, verseNumber: 2 } },
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

    rerender({ chapterId: 10, verseNumber: 1 });

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
