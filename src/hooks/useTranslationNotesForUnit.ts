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
  userId: number | null | undefined;
  projectId: number | null;
  bookCode: string;
  versesKey: string;
  languageCode: string | undefined;
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
 * Downloaded rows win; fluent-api translation-resources (fluent-api #274)
 * is only hit when nothing usable is downloaded and the device is online.
 * Online pericope units fan out across their verse refs (#593).
 */
export function useTranslationNotesForUnit(
  params: UseTranslationNotesForUnitParams,
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
    userId,
    projectId,
    bookCode,
    versesKey,
    languageCode,
    value: { status: 'loading' },
  });
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (refresh = false) => {
      const requestId = ++requestIdRef.current;
      setTracked({
        userId,
        projectId,
        bookCode,
        versesKey,
        languageCode,
        value: { status: 'loading' },
      });
      try {
        const notes = await loadTranslationNotesForUnit({
          projectId,
          userId,
          isOnline,
          bookCode,
          chapterNumber,
          verseNumber,
          verseRefs: refs,
          languageCode,
          refresh,
        });
        if (requestId !== requestIdRef.current) {
          return;
        }
        setTracked({
          userId,
          projectId,
          bookCode,
          versesKey,
          languageCode,
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
          userId,
          projectId,
          bookCode,
          versesKey,
          languageCode,
          value: {
            status: 'error',
            message: TRANSLATION_NOTES_LOAD_ERROR,
          },
        });
      }
    },
    [
      projectId,
      userId,
      isOnline,
      bookCode,
      chapterNumber,
      verseNumber,
      refs,
      versesKey,
      languageCode,
    ],
  );

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);
  const retry = useCallback(() => load(true), [load]);

  const state: TranslationNotesLoadState =
    tracked.userId === userId &&
    tracked.projectId === projectId &&
    tracked.bookCode === bookCode &&
    tracked.versesKey === versesKey &&
    tracked.languageCode === languageCode
      ? tracked.value
      : { status: 'loading' };

  return {
    state,
    retry,
  };
}

function verseNumbersKeySafe(verseNumbers: number[] | undefined): string {
  if (!verseNumbers || verseNumbers.length === 0) {
    return '';
  }
  return [...verseNumbers].sort((a, b) => a - b).join(',');
}
