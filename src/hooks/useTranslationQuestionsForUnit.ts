import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../constants/messages';
import {
  loadTranslationQuestionsForUnit,
  type LoadTranslationQuestionsParams,
} from '../services/translationQuestions';
import { TranslationQuestionItem } from '../types/resources/translationQuestions';
import {
  verseRefsFromChapter,
  verseRefsKey,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { logger } from '../utils/logger';

const log = logger.create('useTranslationQuestionsForUnit');

export type TranslationQuestionsLoadState =
  | { status: 'loading' }
  | { status: 'ready'; questions: TranslationQuestionItem[] }
  | { status: 'error'; message: string };

type TrackedLoadState = {
  projectId: number | null;
  bookCode: string;
  versesKey: string;
  value: TranslationQuestionsLoadState;
};

export type UseTranslationQuestionsForUnitParams =
  LoadTranslationQuestionsParams;

function resolveRefs(
  params: LoadTranslationQuestionsParams,
): ResourceVerseRef[] {
  if (params.verseRefs && params.verseRefs.length > 0) {
    return params.verseRefs;
  }
  return verseRefsFromChapter(
    params.chapterNumber,
    params.verseNumber,
    params.verseNumbers,
  );
}

function verseNumbersKeySafe(verseNumbers: number[] | undefined): string {
  if (!verseNumbers || verseNumbers.length === 0) {
    return '';
  }
  return [...verseNumbers].sort((a, b) => a - b).join(',');
}

/**
 * Section-scoped TQ loader (#190). Failures stay local — do not block Notes / Images.
 * Ignores stale responses when the active unit changes mid-load.
 * Downloaded rows win; fluent-api translation-resources (fluent-api #274)
 * is only hit when nothing usable is downloaded and the device is online.
 * Online pericope units fan out across their verse refs (#593).
 */
export function useTranslationQuestionsForUnit(
  params: UseTranslationQuestionsForUnitParams,
) {
  const {
    projectId,
    userId,
    isOnline,
    bookCode,
    chapterNumber,
    verseNumber,
    verseNumbers,
    verseRefs,
    languageCode,
  } = params;

  const verseRefsSerialized = verseRefsKey(verseRefs ?? []);
  const verseNumbersSerialized = verseNumbersKeySafe(verseNumbers);
  const refs = useMemo(
    () =>
      resolveRefs({
        projectId,
        bookCode,
        chapterNumber,
        verseNumber,
        verseNumbers,
        verseRefs,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projectId,
      bookCode,
      chapterNumber,
      verseNumber,
      verseRefsSerialized,
      verseNumbersSerialized,
    ],
  );
  const versesKey = useMemo(() => verseRefsKey(refs), [refs]);

  const [tracked, setTracked] = useState<TrackedLoadState>({
    projectId,
    bookCode,
    versesKey,
    value: { status: 'loading' },
  });
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setTracked({
      projectId,
      bookCode,
      versesKey,
      value: { status: 'loading' },
    });
    try {
      const questions = await loadTranslationQuestionsForUnit({
        projectId,
        userId,
        isOnline,
        bookCode,
        chapterNumber,
        verseNumber,
        verseRefs: refs,
        languageCode,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setTracked({
        projectId,
        bookCode,
        versesKey,
        value: { status: 'ready', questions },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Translation Questions load failed', {
        projectId,
        bookCode,
        versesKey,
        error: error instanceof Error ? error.message : String(error),
      });
      setTracked({
        projectId,
        bookCode,
        versesKey,
        value: {
          status: 'error',
          message: TRANSLATION_QUESTIONS_LOAD_ERROR,
        },
      });
    }
  }, [
    projectId,
    userId,
    isOnline,
    bookCode,
    chapterNumber,
    verseNumber,
    refs,
    versesKey,
    languageCode,
  ]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const state: TranslationQuestionsLoadState =
    tracked.projectId === projectId &&
    tracked.bookCode === bookCode &&
    tracked.versesKey === versesKey
      ? tracked.value
      : { status: 'loading' };

  return {
    state,
    retry: load,
  };
}
