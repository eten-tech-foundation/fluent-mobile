import { useCallback, useEffect, useRef, useState } from 'react';
import { loadTranslationQuestionsForUnit } from '../mocks/resources/translationQuestionsMock';
import { TranslationQuestionItem } from '../types/resources/translationQuestions';
import { logger } from '../utils/logger';

const log = logger.create('useTranslationQuestionsForUnit');

export type TranslationQuestionsLoadState =
  | { status: 'loading' }
  | { status: 'ready'; questions: TranslationQuestionItem[] }
  | { status: 'error'; message: string };

/**
 * Section-scoped TQ loader (#190). Failures stay local — do not block Notes / Images.
 * Ignores stale responses when the active unit changes mid-load.
 */
export function useTranslationQuestionsForUnit(
  chapterId: number,
  verseNumber: number,
) {
  const [state, setState] = useState<TranslationQuestionsLoadState>({
    status: 'loading',
  });
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState({ status: 'loading' });
    try {
      const questions = await loadTranslationQuestionsForUnit(
        chapterId,
        verseNumber,
      );
      if (requestId !== requestIdRef.current) {
        return;
      }
      setState({ status: 'ready', questions });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Translation Questions load failed', {
        chapterId,
        verseNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      setState({
        status: 'error',
        message: 'Unable to load Translation Questions.',
      });
    }
  }, [chapterId, verseNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    state,
    retry: load,
  };
}
