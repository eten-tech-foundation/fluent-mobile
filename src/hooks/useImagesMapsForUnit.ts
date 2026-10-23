import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IMAGES_MAPS_LOAD_ERROR } from '../constants/messages';
import {
  loadImagesMapsForUnit,
  type LoadImagesMapsParams,
} from '../services/imagesMaps';
import { ImagesMapsItem } from '../types/resources/imagesMaps';
import {
  verseRefsFromChapter,
  verseRefsKey,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { logger } from '../utils/logger';

const log = logger.create('useImagesMapsForUnit');

export type ImagesMapsLoadState =
  | { status: 'loading' }
  | { status: 'ready'; items: ImagesMapsItem[] }
  | { status: 'error'; message: string };

type TrackedLoadState = {
  projectId: number | null;
  bookCode: string;
  versesKey: string;
  value: ImagesMapsLoadState;
};

export type UseImagesMapsForUnitParams = LoadImagesMapsParams;

function resolveRefs(params: LoadImagesMapsParams): ResourceVerseRef[] {
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
 * Section-scoped Images & Maps loader (#191). Failures stay local.
 * Ignores stale responses when the active unit changes mid-load.
 * Downloaded rows win; fluent-api translation-resources (fluent-api #274)
 * is only hit when nothing usable is downloaded and the device is online.
 * Online pericope units fan out across their verse refs (#593).
 */
export function useImagesMapsForUnit(params: UseImagesMapsForUnitParams) {
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
      const items = await loadImagesMapsForUnit({
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
        value: { status: 'ready', items },
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.warn('Images & Maps load failed', {
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
          message: IMAGES_MAPS_LOAD_ERROR,
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

  const state: ImagesMapsLoadState =
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
