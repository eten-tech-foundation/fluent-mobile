import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../constants/messages';
import {
  loadTranslationNotesForUnit,
  type LoadTranslationNotesParams,
} from '../services/translationNotes';
import { TranslationNoteItem } from '../types/resources/translationNotes';
import {
  verseRefsFromChapter,
  verseRefsKey,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { logger } from '../utils/logger';

const log = logger.create('useTranslationNotesForUnit');

export type TranslationNotesLoadState =
  | { status: 'loading' }
  | { status: 'ready'; notes: TranslationNoteItem[] }
  | { status: 'error'; message: string };

type TrackedLoadState = {
  projectId: number | null;
  bookCode: string;
  versesKey: string;
  value: TranslationNotesLoadState;
};

export type UseTranslationNotesForUnitParams = LoadTranslationNotesParams;

function resolveRefs(params: LoadTranslationNotesParams): ResourceVerseRef[] {
  if (params.verseRefs && params.verseRefs.length > 0) {
    return params.verseRefs;
  }
  return verseRefsFromChapter(
    params.chapterNumber,
    params.verseNumber,
    params.verseNumbers,
  );
}

/**
 * Section-scoped TN loader (#189). Failures stay local — do not block TQ / Images.
 * Ignores stale responses when the active unit changes mid-load.
 * Loads via fluent-api translation-resources (fluent-api #274); pericope fan-out (#593).
 */
export function useTranslationNotesForUnit(
  params: UseTranslationNotesForUnitParams,
) {
  const {
    projectId,
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
    // Prefer serialized keys so array identity alone does not reload.
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
      const notes = await loadTranslationNotesForUnit({
        projectId,
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
        value: { status: 'ready', notes },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Translation Notes load failed', {
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
          message: TRANSLATION_NOTES_LOAD_ERROR,
        },
      });
    }
  }, [
    projectId,
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

  const state: TranslationNotesLoadState =
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

function verseNumbersKeySafe(verseNumbers: number[] | undefined): string {
  if (!verseNumbers || verseNumbers.length === 0) {
    return '';
  }
  return [...verseNumbers].sort((a, b) => a - b).join(',');
}
