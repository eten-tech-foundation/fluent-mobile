import { useCallback, useEffect, useRef, useState } from 'react';
import { IMAGES_MAPS_LOAD_ERROR } from '../constants/messages';
import {
  loadImagesMapsForUnit,
  type LoadImagesMapsParams,
} from '../services/imagesMaps';
import { ImagesMapsItem } from '../types/resources/imagesMaps';
import { logger } from '../utils/logger';

const log = logger.create('useImagesMapsForUnit');

export type ImagesMapsLoadState =
  | { status: 'loading' }
  | { status: 'ready'; items: ImagesMapsItem[] }
  | { status: 'error'; message: string };

type TrackedLoadState = {
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  value: ImagesMapsLoadState;
};

export type UseImagesMapsForUnitParams = LoadImagesMapsParams;

/**
 * Section-scoped Images & Maps loader (#191). Failures stay local.
 * Ignores stale responses when the active unit changes mid-load.
 * Loads via fluent-api translation-resources (fluent-api #274).
 */
export function useImagesMapsForUnit(params: UseImagesMapsForUnitParams) {
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
      const items = await loadImagesMapsForUnit({
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
        value: { status: 'ready', items },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Images & Maps load failed', {
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
          message: IMAGES_MAPS_LOAD_ERROR,
        },
      });
    }
  }, [projectId, bookCode, chapterNumber, verseNumber, languageCode]);

  useEffect(() => {
    void load();
    return () => {
      // Invalidate in-flight work so a stale response cannot apply after unit change / unmount.
      requestIdRef.current += 1;
    };
  }, [load]);

  const state: ImagesMapsLoadState =
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
