import { useCallback, useEffect, useRef, useState } from 'react';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../constants/messages';
import { loadTranslationQuestionsForUnit } from '../mocks/resources/translationQuestionsMock';
import { TranslationQuestionItem } from '../types/resources/translationQuestions';
import { logger } from '../utils/logger';

const log = logger.create('useTranslationQuestionsForUnit');

export type TranslationQuestionsLoadState =
  | { status: 'loading' }
  | { status: 'ready'; questions: TranslationQuestionItem[] }
  | { status: 'error'; message: string };

type TrackedLoadState = {
  chapterId: number;
  verseNumber: number;
  value: TranslationQuestionsLoadState;
};

/**
 * Section-scoped TQ loader (#190). Failures stay local — do not block Notes / Images.
 * Ignores stale responses when the active unit changes mid-load.
 */
export function useTranslationQuestionsForUnit(
  chapterId: number,
  verseNumber: number,
) {
  const [tracked, setTracked] = useState<TrackedLoadState>({
    chapterId,
    verseNumber,
    value: { status: 'loading' },
  });
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setTracked({
      chapterId,
      verseNumber,
      value: { status: 'loading' },
    });
    try {
      const questions = await loadTranslationQuestionsForUnit(
        chapterId,
        verseNumber,
      );
      if (requestId !== requestIdRef.current) {
        return;
      }
      setTracked({
        chapterId,
        verseNumber,
        value: { status: 'ready', questions },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Translation Questions load failed', {
        chapterId,
        verseNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      setTracked({
        chapterId,
        verseNumber,
        value: {
          status: 'error',
          message: TRANSLATION_QUESTIONS_LOAD_ERROR,
        },
      });
    }
  }, [chapterId, verseNumber]);

  useEffect(() => {
    void load();
    return () => {
      // Invalidate in-flight work so a stale response cannot apply after unit change / unmount.
      requestIdRef.current += 1;
    };
  }, [load]);

  const state: TranslationQuestionsLoadState =
    tracked.chapterId === chapterId && tracked.verseNumber === verseNumber
      ? tracked.value
      : { status: 'loading' };

  return {
    state,
    retry: load,
  };
}
