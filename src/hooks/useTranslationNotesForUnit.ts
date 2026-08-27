import { useCallback, useEffect, useRef, useState } from 'react';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../constants/messages';
import {
  loadTranslationNotesForUnit,
  type LoadTranslationNotesParams,
} from '../services/translationNotes';
import { TranslationNoteItem } from '../types/resources/translationNotes';
import { logger } from '../utils/logger';

const log = logger.create('useTranslationNotesForUnit');

export type TranslationNotesLoadState =
  | { status: 'loading' }
  | { status: 'ready'; notes: TranslationNoteItem[] }
  | { status: 'error'; message: string };

type TrackedLoadState = {
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  value: TranslationNotesLoadState;
};

export type UseTranslationNotesForUnitParams = LoadTranslationNotesParams;

/**
 * Section-scoped TN loader (#189). Failures stay local — do not block TQ / Images.
 * Ignores stale responses when the active unit changes mid-load.
 * Loads via fluent-api translation-resources (fluent-api #274).
 */
export function useTranslationNotesForUnit(
  params: UseTranslationNotesForUnitParams,
) {
  const { projectId, bookCode, chapterNumber, verseNumber, languageCode } =
    params;

  const [tracked, setTracked] = useState<TrackedLoadState>({
    projectId,
    bookCode,
    chapterNumber,
    verseNumber,
    value: { status: 'loading' },
  });
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setTracked({
      projectId,
      bookCode,
      chapterNumber,
      verseNumber,
      value: { status: 'loading' },
    });
    try {
      const notes = await loadTranslationNotesForUnit({
        projectId,
        bookCode,
        chapterNumber,
        verseNumber,
        languageCode,
      });
      if (requestId !== requestIdRef.current) {
        return;
      }
      setTracked({
        projectId,
        bookCode,
        chapterNumber,
        verseNumber,
        value: { status: 'ready', notes },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Translation Notes load failed', {
        projectId,
        bookCode,
        chapterNumber,
        verseNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      setTracked({
        projectId,
        bookCode,
        chapterNumber,
        verseNumber,
        value: {
          status: 'error',
          message: TRANSLATION_NOTES_LOAD_ERROR,
        },
      });
    }
  }, [projectId, bookCode, chapterNumber, verseNumber, languageCode]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const state: TranslationNotesLoadState =
    tracked.projectId === projectId &&
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
