import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTranslationQuestionsForUnit } from './useTranslationQuestionsForUnit';
import { setMockTranslationQuestionsLoadFailure } from '../mocks/resources/translationQuestionsMock';

describe('useTranslationQuestionsForUnit', () => {
  afterEach(() => {
    setMockTranslationQuestionsLoadFailure(false);
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

    setMockTranslationQuestionsLoadFailure(false);
    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });
});
