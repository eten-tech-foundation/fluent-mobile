import { useCallback, useEffect, useRef, useState } from 'react';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../constants/messages';
import {
  loadTranslationQuestionsForUnit,
  type LoadTranslationQuestionsParams,
} from '../services/translationQuestions';
import { TranslationQuestionItem } from '../types/resources/translationQuestions';
import { logger } from '../utils/logger';

const log = logger.create('useTranslationQuestionsForUnit');

export type TranslationQuestionsLoadState =
  | { status: 'loading' }
  | { status: 'ready'; questions: TranslationQuestionItem[] }
  | { status: 'error'; message: string };

type TrackedLoadState = {
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  value: TranslationQuestionsLoadState;
};

export type UseTranslationQuestionsForUnitParams =
  LoadTranslationQuestionsParams;

/**
 * Section-scoped TQ loader (#190). Failures stay local — do not block Notes / Images.
 * Ignores stale responses when the active unit changes mid-load.
 * Loads real Aquifer uW TQ (interim until fluent-api#273).
 */
export function useTranslationQuestionsForUnit(
  params: UseTranslationQuestionsForUnitParams,
) {
  const { bookCode, chapterNumber, verseNumber, languageCode } = params;

  const [tracked, setTracked] = useState<TrackedLoadState>({
    bookCode,
    chapterNumber,
    verseNumber,
    value: { status: 'loading' },
  });
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setTracked({
      bookCode,
      chapterNumber,
      verseNumber,
      value: { status: 'loading' },
    });
    try {
      const questions = await loadTranslationQuestionsForUnit({
        bookCode,
        chapterNumber,
        verseNumber,
        languageCode,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setTracked({
        bookCode,
        chapterNumber,
        verseNumber,
        value: { status: 'ready', questions },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Translation Questions load failed', {
        bookCode,
        chapterNumber,
        verseNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      setTracked({
        bookCode,
        chapterNumber,
        verseNumber,
        value: {
          status: 'error',
          message: TRANSLATION_QUESTIONS_LOAD_ERROR,
        },
      });
    }
  }, [bookCode, chapterNumber, verseNumber, languageCode]);

  useEffect(() => {
    void load();
    return () => {
      // Invalidate in-flight work so a stale response cannot apply after unit change / unmount.
      requestIdRef.current += 1;
    };
  }, [load]);

  const state: TranslationQuestionsLoadState =
    tracked.bookCode === bookCode &&
    tracked.chapterNumber === chapterNumber &&
    tracked.verseNumber === verseNumber
      ? tracked.value
      : { status: 'loading' };

  return {
    state,
    retry: load,
  };
}
