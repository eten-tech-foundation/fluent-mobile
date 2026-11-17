import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../constants/messages';
import {
  loadTranslationNotesForUnit,
  mergeTranslationNotesRetry,
  type LoadTranslationNotesParams,
  type TranslationNotesLoadResult,
} from '../services/translationNotes';
import {
  passageResourceEpoch,
  subscribePassageResourceClears,
} from '../services/passageResourceReuse';
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
  | {
      status: 'ready';
      notes: TranslationNoteItem[];
      /** Verses whose notes failed to load; `retry` asks for just these. */
      failedRefs: ResourceVerseRef[];
      /** Offline verses with nothing downloaded. */
      unavailableOfflineRefs: ResourceVerseRef[];
    }
  | {
      status: 'error';
      message: string;
      /** Every verse failed; empty when the load failed as a whole. */
      failedRefs: ResourceVerseRef[];
    };

type TrackedLoadState = {
  identity: string;
  value: TranslationNotesLoadState;
};

export type UseTranslationNotesForUnitParams = Omit<
  LoadTranslationNotesParams,
  'signal'
>;

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

function stateFor(
  result: TranslationNotesLoadResult,
): TranslationNotesLoadState {
  if (result.succeededRefs.length === 0 && result.failedRefs.length > 0) {
    return {
      status: 'error',
      message: TRANSLATION_NOTES_LOAD_ERROR,
      failedRefs: result.failedRefs,
    };
  }
  return {
    status: 'ready',
    notes: result.notes,
    failedRefs: result.failedRefs,
    unavailableOfflineRefs: result.unavailableOfflineRefs,
  };
}

/**
 * Section-scoped TN loader (#189). Failures stay local — do not block TQ / Images.
 * Ignores stale responses when the active unit changes mid-load, and stops
 * the old load's queue (#901).
 * Downloaded rows win; fluent-api translation-resources (fluent-api #274)
 * is only hit when nothing usable is downloaded and the device is online.
 * Online pericope units fan out across their verse refs (#593). Some verses
 * failing still shows the rest; `retry` then asks only for the failed ones.
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
  const owner = userId === null || userId === undefined ? '' : String(userId);
  const epoch = useSyncExternalStore(subscribePassageResourceClears, () =>
    passageResourceEpoch(owner),
  );
  const identity = JSON.stringify([
    userId ?? null,
    projectId,
    bookCode,
    versesKey,
    languageCode ?? null,
    epoch,
  ]);

  const [tracked, setTracked] = useState<TrackedLoadState>({
    identity,
    value: { status: 'loading' },
  });
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const lastResultRef = useRef<{
    identity: string;
    result: TranslationNotesLoadResult;
  } | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      const requestId = ++requestIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const last = lastResultRef.current;
      const previous =
        refresh && last?.identity === identity && last.result.failedRefs.length
          ? last.result
          : null;
      setTracked({ identity, value: { status: 'loading' } });
      try {
        const loaded = await loadTranslationNotesForUnit({
          projectId,
          userId,
          isOnline,
          bookCode,
          chapterNumber,
          verseNumber,
          verseRefs: previous ? previous.failedRefs : refs,
          languageCode,
          refresh,
          signal: controller.signal,
        });
        if (requestId !== requestIdRef.current) {
          return;
        }
        const result = previous
          ? mergeTranslationNotesRetry(previous, loaded)
          : loaded;
        lastResultRef.current = { identity, result };
        setTracked({ identity, value: stateFor(result) });
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
          identity,
          value: {
            status: 'error',
            message: TRANSLATION_NOTES_LOAD_ERROR,
            failedRefs: [],
          },
        });
      }
    },
    [
      identity,
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
      controllerRef.current?.abort();
    };
  }, [load]);
  const retry = useCallback(() => load(true), [load]);

  const state: TranslationNotesLoadState =
    tracked.identity === identity ? tracked.value : { status: 'loading' };

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
