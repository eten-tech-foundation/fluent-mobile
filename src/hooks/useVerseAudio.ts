import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  addRecordingTake,
  deleteRecordingTake,
  getAllTakesForVerse,
  getTakesForVerse,
  selectRecordingTake,
  setCanonicalTake,
  verseHasMultipleRecorders,
} from '../db/repository';
import type { Recording, RecordingWithOwner } from '../types/db/types';
import {
  deleteFile,
  ensureRecordingsDir,
  fileExists,
  fileSize,
  recordingPath,
} from '../utils/audioStorage';
import { getRemuxNativeModule } from '../audio/aacRemux';
import { ensureSeekableTakeUri } from '../audio/ensureSeekableTakeUri';
import { logger } from '../utils/logger';
import { claimChapterOffline } from '../db/repository';
import { syncChapterClaim } from '../services/chapterClaimSync';
import { usePlaybackEngine } from './usePlaybackEngine';
import { useRecordingEngine } from './useRecordingEngine';
import { getConnectivitySnapshot } from '../services/connectivity';
import { shouldEndPlaybackOnIdle } from './playbackStatusGuards';
import { verseAudioReducer, type VerseAudioState } from './verseAudioReducer';
import { MAX_RECORDING_TAKES } from '../constants/recordingTakes';
import type { DraftingUnit } from '../services/draftingUnitPreference';
import type { RecordingGranularity } from '../types/db/types';
import {
  formatCoveredViewsKey,
  type RecordingUnitCapture,
  type VerseViewRef,
} from '../utils/recordingRange';
import {
  uniqueTakesById,
  type StitchedTakeRow,
} from '../utils/crossGranularityRows';
import {
  advanceStitchQueue,
  createStitchQueue,
  currentStitchUri,
  type StitchQueue,
} from '../utils/stitchQueue';

export type { RecordingUnitCapture };

const log = logger.create('useVerseAudio');

/** Frozen at successful `start()` — `stop()` must not read live recording props. */
export type CapturePersistSnapshot = {
  bibleTextId: number;
  /** Active verse view — mixed take_number cap/list scope (#410). */
  viewBibleTextId: number;
  granularity: RecordingGranularity;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};

export type PersistTakeArgs = CapturePersistSnapshot & {
  tempUri: string;
  durationMs: number;
};

export type VerseAudioPersistDeps = {
  persistTake?: (
    args: PersistTakeArgs,
  ) => Promise<{ id: string; localFilePath: string }>;
  loadTakes?: (bibleTextId: number) => Promise<Recording[]>;
  loadAllTakes?: (bibleTextId: number) => Promise<RecordingWithOwner[]>;
  checkMultipleRecorders?: (bibleTextId: number) => Promise<boolean>;
  countTakesAtView?: (view: VerseViewRef) => Promise<number>;
  deleteTake?: (id: string) => Promise<void>;
  selectTake?: (id: string) => Promise<void>;
  designateCanonical?: (id: string) => Promise<void>;
};

export type ChapterClaimContext = {
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  assignedUserId: number | null | undefined;
};

export type UseVerseAudioArgs = {
  bibleTextId: number | null;
  chapterAssignmentId?: number | null;
  userId?: number | null;
  /** When set, first recording on an unassigned chapter triggers claim (#268/#270). */
  chapterClaim?: ChapterClaimContext | null;
  onChapterClaimed?: () => void;
  chapterNumber?: number;
  verseNumber?: number;
  draftingUnit?: DraftingUnit;
  recordingUnit?: RecordingUnitCapture | null;
} & VerseAudioPersistDeps;

async function defaultPersistTake(
  args: PersistTakeArgs,
): Promise<{ id: string; localFilePath: string }> {
  await ensureRecordingsDir();
  const id = `rec_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const dest = recordingPath(id);
  // Inject native MediaMuxer remux when linked (#233); ADTS stays playable if missing.
  const seekableUri = await ensureSeekableTakeUri(
    args.tempUri,
    getRemuxNativeModule(),
  );
  await FileSystem.copyAsync({ from: seekableUri, to: dest });
  const fileSizeBytes = await fileSize(dest);
  await addRecordingTake({
    id,
    bibleTextId: args.bibleTextId,
    viewBibleTextId: args.viewBibleTextId,
    localFilePath: dest,
    durationMs: args.durationMs,
    fileSizeBytes,
    granularity: args.granularity,
    startChapter: args.startChapter,
    startVerse: args.startVerse,
    endChapter: args.endChapter,
    endVerse: args.endVerse,
  });
  return { id, localFilePath: dest };
}

async function defaultCountTakesAtView(view: VerseViewRef): Promise<number> {
  const rows = await getTakesForVerse(view.bibleTextId, undefined, {
    chapterNumber: view.chapterNumber,
    verseNumber: view.verseNumber,
  });
  return rows.length;
}

/**
 * Composes recorder (#95) + player (#96) + storage (#94) + multi-take (#98)
 * behind the pure {@link verseAudioReducer}. Permission/Alert UX stays in the screen.
 */
export function useVerseAudio({
  bibleTextId,
  chapterAssignmentId = null,
  userId = null,
  chapterClaim = null,
  onChapterClaimed,
  chapterNumber,
  verseNumber,
  draftingUnit = 'verse',
  recordingUnit = null,
  persistTake = defaultPersistTake,
  loadTakes,
  loadAllTakes,
  checkMultipleRecorders,
  countTakesAtView = defaultCountTakesAtView,
  deleteTake: deleteTakeFn = deleteRecordingTake,
  selectTake: selectTakeFn = selectRecordingTake,
  designateCanonical: designateCanonicalFn = setCanonicalTake,
}: UseVerseAudioArgs) {
  const coveredViews = recordingUnit?.coveredViews;
  const coveredViewsRef = useRef(coveredViews);
  coveredViewsRef.current = coveredViews;
  /**
   * Stable dep for the take load: the capture unit is re-resolved (new array
   * identity, same content) on playback transitions, and `loadTakesFn` gates
   * the reload effect that stops playback. Keying on identity killed audio
   * mid-take (#411).
   */
  const coveredViewsKey = formatCoveredViewsKey(coveredViews);

  const loadTakesFn = useCallback(
    async (id: number) => {
      if (loadTakes) {
        return loadTakes(id);
      }
      // Pericope view lists takes for the whole unit, not just the current
      // verse, so verse takes recorded elsewhere in the pericope can stitch
      // (#411). One query per covered verse: a pericope take spanning them all
      // comes back from each, hence the dedupe. The key both gates this branch
      // and re-keys the callback; the array is read from the ref.
      if (draftingUnit === 'pericope' && coveredViewsKey !== '') {
        const groups = await Promise.all(
          (coveredViewsRef.current ?? []).map(covered =>
            getTakesForVerse(covered.bibleTextId, undefined, {
              chapterNumber: covered.chapterNumber,
              verseNumber: covered.verseNumber,
            }),
          ),
        );
        return uniqueTakesById(groups);
      }
      const view =
        typeof chapterNumber === 'number' && typeof verseNumber === 'number'
          ? { chapterNumber, verseNumber }
          : undefined;
      return getTakesForVerse(id, undefined, view);
    },
    [loadTakes, chapterNumber, verseNumber, draftingUnit, coveredViewsKey],
  );
  const loadAllTakesFn = useCallback(
    (id: number) => {
      const view =
        typeof chapterNumber === 'number' && typeof verseNumber === 'number'
          ? { chapterNumber, verseNumber }
          : undefined;
      return loadAllTakes ? loadAllTakes(id) : getAllTakesForVerse(id, view);
    },
    [loadAllTakes, chapterNumber, verseNumber],
  );
  const checkMultipleRecordersFn = useCallback(
    (id: number) => {
      const view =
        typeof chapterNumber === 'number' && typeof verseNumber === 'number'
          ? { chapterNumber, verseNumber }
          : undefined;
      return checkMultipleRecorders
        ? checkMultipleRecorders(id)
        : verseHasMultipleRecorders(id, undefined, view);
    },
    [checkMultipleRecorders, chapterNumber, verseNumber],
  );
  const recording = useRecordingEngine();
  const playback = usePlaybackEngine();
  const [state, dispatch] = useReducer(
    verseAudioReducer,
    'idle' as VerseAudioState,
  );
  const [takes, setTakes] = useState<Recording[]>([]);
  const [allTakes, setAllTakes] = useState<RecordingWithOwner[]>([]);
  const [hasMultipleRecorders, setHasMultipleRecorders] = useState(false);
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  /**
   * Take currently prepared in the player. Outlives `playingTakeId` (which
   * clears at the natural end of playback) so a finished take stays scrubbable
   * until it is stopped, deleted, or the verse changes (#176).
   */
  const [loadedTakeId, setLoadedTakeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const capturePersistRef = useRef<CapturePersistSnapshot | null>(null);
  const allTakesRequestIdRef = useRef(0);
  const chapterAssignedRef = useRef(false);
  const activeBibleTextIdRef = useRef<number | null>(null);
  /**
   * `playback.play` / `load` briefly leave the engine `idle` while `replace`
   * runs. If verse state is already `playing` (Take 1 → Take 2), the natural-end
   * effect must not treat that gap as PLAYBACK_END (#298).
   */
  const playbackLoadInFlightRef = useRef(false);
  /** Bumped when an in-flight load ends so the natural-end effect re-checks. */
  const [playbackLoadGate, setPlaybackLoadGate] = useState(0);
  /** Remaining segments of a stitched row, or null when not stitching (#411). */
  const stitchQueueRef = useRef<StitchQueue | null>(null);
  const stitchRowIdRef = useRef<string | null>(null);

  const clearStitchQueue = useCallback(() => {
    stitchQueueRef.current = null;
    stitchRowIdRef.current = null;
  }, []);

  useEffect(() => {
    chapterAssignedRef.current = false;
  }, [chapterAssignmentId]);

  /**
   * Pericope view loads takes for the whole unit (#411), so "the selected
   * draft here" must still mean the active verse view — otherwise a verse-4
   * take answers for verse 3 and feeds the seek fallback.
   */
  const isTakeInActiveView = useCallback(
    (take: Recording) =>
      draftingUnit !== 'pericope' ||
      take.granularity === 'pericope' ||
      (take.startChapter === chapterNumber && take.startVerse === verseNumber),
    [chapterNumber, draftingUnit, verseNumber],
  );
  const selectedTake =
    takes.find(t => t.isSelected && isTakeInActiveView(t)) ?? null;
  const [rangeCapBlocked, setRangeCapBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const views = recordingUnit?.coveredViews;
    if (draftingUnit !== 'pericope' || !views?.length) {
      setRangeCapBlocked(false);
      return;
    }
    void Promise.all(views.map(view => countTakesAtView(view))).then(counts => {
      if (!cancelled) {
        setRangeCapBlocked(counts.some(c => c >= MAX_RECORDING_TAKES));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [countTakesAtView, draftingUnit, recordingUnit, takes]);

  const canRecordNewTake =
    draftingUnit === 'pericope'
      ? recordingUnit !== null && !rangeCapBlocked
      : takes.length < MAX_RECORDING_TAKES;
  const ownCanonicalTakeId =
    takes.find(t => t.isCanonical && isTakeInActiveView(t))?.id ?? null;

  const refreshAllTakes = useCallback(
    async (id: number) => {
      const requestId = ++allTakesRequestIdRef.current;
      try {
        const [rows, multi] = await Promise.all([
          loadAllTakesFn(id),
          checkMultipleRecordersFn(id),
        ]);
        if (requestId !== allTakesRequestIdRef.current) {
          return;
        }
        setAllTakes(rows);
        setHasMultipleRecorders(multi);
      } catch (error) {
        log.error('Failed to load all takes', { error });
      }
    },
    [loadAllTakesFn, checkMultipleRecordersFn],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadedTakeId(null);
    setPlayingTakeId(null);
    clearStitchQueue();
    activeBibleTextIdRef.current = bibleTextId;
    // Stop any in-flight draft playback when the active verse unit changes (#235).
    void playback.stop();
    (async () => {
      if (bibleTextId === null) {
        allTakesRequestIdRef.current += 1;
        setTakes([]);
        setAllTakes([]);
        setHasMultipleRecorders(false);
        dispatch({ type: 'REHYDRATE', hasTake: false });
        return;
      }
      try {
        const rows = await loadTakesFn(bibleTextId);
        if (cancelled) return;
        setTakes(rows);
        dispatch({ type: 'REHYDRATE', hasTake: rows.length > 0 });
        await refreshAllTakes(bibleTextId);
      } catch (error) {
        log.error('Failed to load takes', { error });
        if (!cancelled) {
          dispatch({
            type: 'ERROR',
            message: error instanceof Error ? error.message : 'load failed',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // playback identity changes every render; stop() is bound to the stable engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bibleTextId-driven reload
  }, [bibleTextId, loadTakesFn, refreshAllTakes, clearStitchQueue]);

  const start = useCallback(async () => {
    if (bibleTextId === null) return;
    // Wait until capture metadata resolves so pericope mode cannot persist as verse.
    if (draftingUnit === 'pericope' && recordingUnit === null) return;

    if (draftingUnit === 'pericope' && recordingUnit?.coveredViews.length) {
      const counts = await Promise.all(
        recordingUnit.coveredViews.map(view => countTakesAtView(view)),
      );
      if (counts.some(c => c >= MAX_RECORDING_TAKES)) {
        setErrorMessage(
          'Maximum of 5 takes reached. Delete a take before recording another.',
        );
        return;
      }
    } else if (!canRecordNewTake) {
      setErrorMessage(
        'Maximum of 5 takes reached. Delete a take before recording another.',
      );
      return;
    }
    try {
      // Stop review playback first so re-record from `playing` can transition
      // and so audio mode is free for the mic (see createRecordingEngine).
      try {
        await playback.stop();
      } catch {
        // Ignore — recorder start below is what matters.
      }
      setPlayingTakeId(null);
      setLoadedTakeId(null);
      clearStitchQueue();
      const anchorBibleTextId = recordingUnit?.anchorBibleTextId ?? bibleTextId;
      capturePersistRef.current = {
        bibleTextId: anchorBibleTextId,
        viewBibleTextId: bibleTextId,
        granularity: recordingUnit?.granularity ?? 'verse',
        startChapter: recordingUnit?.startChapter ?? chapterNumber ?? 0,
        startVerse: recordingUnit?.startVerse ?? verseNumber ?? 0,
        endChapter: recordingUnit?.endChapter ?? chapterNumber ?? 0,
        endVerse: recordingUnit?.endVerse ?? verseNumber ?? 0,
      };
      log.debug('starting capture', {
        draftingUnit,
        bibleTextId,
        anchorBibleTextId: capturePersistRef.current.bibleTextId,
        granularity: capturePersistRef.current.granularity,
        span: `${capturePersistRef.current.startChapter}:${capturePersistRef.current.startVerse}-${capturePersistRef.current.endChapter}:${capturePersistRef.current.endVerse}`,
        coveredViewCount: recordingUnit?.coveredViews.length ?? 1,
      });
      await recording.start();
      dispatch({ type: 'START' });
      setErrorMessage(null);
    } catch (error) {
      capturePersistRef.current = null;
      const message = error instanceof Error ? error.message : 'start failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [
    bibleTextId,
    canRecordNewTake,
    chapterNumber,
    clearStitchQueue,
    countTakesAtView,
    draftingUnit,
    playback,
    recording,
    recordingUnit,
    verseNumber,
  ]);

  const pause = useCallback(async () => {
    try {
      await recording.pause();
      dispatch({ type: 'PAUSE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'pause failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [recording]);

  const resume = useCallback(async () => {
    try {
      await recording.resume();
      dispatch({ type: 'RESUME' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'resume failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [recording]);

  const stop = useCallback(async () => {
    const snapshot = capturePersistRef.current;
    if (snapshot === null) return;
    try {
      const { uri, durationMs } = await recording.stop();
      dispatch({ type: 'STOP' });
      const persistMeta = {
        ...snapshot,
        tempUri: uri,
        durationMs,
      };
      log.debug('persisting take', {
        span: `${persistMeta.startChapter}:${persistMeta.startVerse}-${persistMeta.endChapter}:${persistMeta.endVerse}`,
        granularity: persistMeta.granularity,
        anchorBibleTextId: persistMeta.bibleTextId,
        viewBibleTextId: persistMeta.viewBibleTextId,
        durationMs: persistMeta.durationMs,
      });
      await persistTake(persistMeta);

      try {
        if (
          userId !== null &&
          chapterAssignmentId !== null &&
          chapterClaim !== null &&
          // eslint-disable-next-line eqeqeq -- nullish check covers undefined + null
          chapterClaim.assignedUserId == null &&
          !chapterAssignedRef.current
        ) {
          const { isOnline } = await getConnectivitySnapshot();
          if (!isOnline) {
            const claimed = await claimChapterOffline(
              chapterAssignmentId,
              userId,
            );
            if (claimed) {
              chapterAssignedRef.current = true;
              onChapterClaimed?.();
            }
          } else {
            const response = await syncChapterClaim(
              chapterAssignmentId,
              userId,
            );
            if (
              !response.hasClaimConflict &&
              response.assignedUserId === userId
            ) {
              chapterAssignedRef.current = true;
              onChapterClaimed?.();
            }
          }
        }
      } catch (claimError) {
        log.error('Chapter claim failed', {
          message:
            claimError instanceof Error
              ? claimError.message
              : String(claimError),
          stack: claimError instanceof Error ? claimError.stack : undefined,
        });
      }

      const rows = await loadTakesFn(snapshot.viewBibleTextId);
      setTakes(rows);
      await refreshAllTakes(snapshot.viewBibleTextId);
      capturePersistRef.current = null;
      dispatch({ type: 'SAVED' });
    } catch (error) {
      capturePersistRef.current = null;
      const message = error instanceof Error ? error.message : 'stop failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [
    chapterAssignmentId,
    chapterClaim,
    loadTakesFn,
    onChapterClaimed,
    persistTake,
    recording,
    userId,
    refreshAllTakes,
  ]);

  /** File checks + engine play, shared by single takes and stitched segments. */
  const playUri = useCallback(
    async (path: string) => {
      const exists = await fileExists(path);
      if (!exists) {
        throw new Error('Take file is missing on disk. Re-record this verse.');
      }
      const size = await fileSize(path);
      if (size === undefined || size <= 0) {
        throw new Error('Take file is empty (0 bytes). Re-record this verse.');
      }
      await playback.play(path);
    },
    [playback],
  );

  const playTake = useCallback(
    async (take: Recording) => {
      playbackLoadInFlightRef.current = true;
      try {
        clearStitchQueue();
        setErrorMessage(null);
        await playUri(take.localFilePath);
        setPlayingTakeId(take.id);
        setLoadedTakeId(take.id);
        dispatch({ type: 'PLAY' });
      } catch (error) {
        setPlayingTakeId(null);
        setLoadedTakeId(null);
        const message = error instanceof Error ? error.message : 'play failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      } finally {
        playbackLoadInFlightRef.current = false;
        setPlaybackLoadGate(n => n + 1);
      }
    },
    [clearStitchQueue, playUri],
  );

  /**
   * Play one segment of a stitched row. `playbackLoadInFlightRef` is set
   * **before** `replace` so the natural-end effect cannot read the unload gap
   * as end-of-playback and drop the rest of the queue (#298).
   */
  const playStitchedSegment = useCallback(
    async (uri: string, rowId: string) => {
      playbackLoadInFlightRef.current = true;
      try {
        setErrorMessage(null);
        await playUri(uri);
        setPlayingTakeId(rowId);
        // Stitched rows are not seekable — no single file backs the row.
        setLoadedTakeId(null);
        dispatch({ type: 'PLAY' });
      } catch (error) {
        clearStitchQueue();
        setPlayingTakeId(null);
        setLoadedTakeId(null);
        const message = error instanceof Error ? error.message : 'play failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      } finally {
        playbackLoadInFlightRef.current = false;
        setPlaybackLoadGate(n => n + 1);
      }
    },
    [clearStitchQueue, playUri],
  );

  /** Play a synthetic stitched row's verse takes back to back (#411). */
  const playStitched = useCallback(
    async (row: StitchedTakeRow) => {
      // Resume mid-row after pause — keep queue position and segment file.
      if (
        stitchRowIdRef.current === row.id &&
        stitchQueueRef.current !== null &&
        playback.status === 'paused'
      ) {
        const resumeUri = currentStitchUri(stitchQueueRef.current);
        if (resumeUri !== null) {
          await playStitchedSegment(resumeUri, row.id);
          return;
        }
      }
      const queue = createStitchQueue(
        row.segments.map(segment => segment.localFilePath),
      );
      const uri = currentStitchUri(queue);
      if (!queue || uri === null) {
        const message = 'No recordings to play for this pericope.';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
        return;
      }
      stitchQueueRef.current = queue;
      stitchRowIdRef.current = row.id;
      await playStitchedSegment(uri, row.id);
    },
    [playStitchedSegment, playback.status],
  );

  /**
   * Review scrub (#176): seek the loaded take (loads without playing if needed).
   * Prefer the take currently in the player (`loadedTakeId`), else the selected
   * draft. Accurate absolute seek needs a seekable container (`.m4a`); ADTS
   * takes are remuxed via {@link getRemuxNativeModule} on commit (#233).
   */
  const seek = useCallback(
    async (ms: number) => {
      const take =
        (loadedTakeId !== null
          ? takes.find(t => t.id === loadedTakeId)
          : null) ?? selectedTake;
      if (!take?.localFilePath) return;
      playbackLoadInFlightRef.current = true;
      try {
        const path = take.localFilePath;
        const exists = await fileExists(path);
        if (!exists) {
          throw new Error(
            'Take file is missing on disk. Re-record this verse.',
          );
        }
        // Scrubbing a real row abandons a stitched row's remaining segments.
        clearStitchQueue();
        setErrorMessage(null);
        await playback.load(path);
        setPlayingTakeId(take.id);
        setLoadedTakeId(take.id);
        const capped =
          typeof take.durationMs === 'number' && take.durationMs > 0
            ? Math.min(Math.max(0, ms), take.durationMs)
            : Math.max(0, ms);
        await playback.seek(capped);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'seek failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      } finally {
        playbackLoadInFlightRef.current = false;
        setPlaybackLoadGate(n => n + 1);
      }
    },
    [clearStitchQueue, loadedTakeId, playback, selectedTake, takes],
  );

  /** Pause draft review playback (design review control shows Pause while playing). */
  const pausePlayback = useCallback(async () => {
    // No-op when already idle/paused so exclusivity fallbacks cannot cascade
    // expo-audio status → setState loops on physical devices.
    if (state !== 'playing' && playback.status !== 'playing') {
      return;
    }
    try {
      const isStitched = stitchRowIdRef.current !== null;
      // Stitched rows keep queue + playingTakeId so Play resumes in-segment.
      if (!isStitched) {
        clearStitchQueue();
        setPlayingTakeId(null);
      }
      await playback.pause();
      dispatch({ type: 'PLAYBACK_END' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'pause playback failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [clearStitchQueue, playback, state]);

  // Natural end (`didJustFinish` → idle). Explicit pause already dispatches
  // PLAYBACK_END. Do not treat brief idle during in-flight play/load (replace)
  // as end — that raced Take 2 play and could bounce the reducer (#298).
  useEffect(() => {
    if (
      !shouldEndPlaybackOnIdle(
        state,
        playback.status,
        playbackLoadInFlightRef.current,
      )
    ) {
      return;
    }
    // A stitched row is not finished until its last segment ends (#411).
    const nextQueue = advanceStitchQueue(stitchQueueRef.current);
    const nextUri = currentStitchUri(nextQueue);
    const rowId = stitchRowIdRef.current;
    if (nextQueue && nextUri !== null && rowId !== null) {
      stitchQueueRef.current = nextQueue;
      void playStitchedSegment(nextUri, rowId);
      return;
    }
    clearStitchQueue();
    dispatch({ type: 'PLAYBACK_END' });
    setPlayingTakeId(null);
  }, [
    state,
    playback.status,
    playbackLoadGate,
    clearStitchQueue,
    playStitchedSegment,
  ]);

  const deleteTake = useCallback(
    async (id: string) => {
      try {
        const target = takes.find(t => t.id === id);
        // A deleted take may be a stitched segment — drop the queue either way.
        clearStitchQueue();
        // The player still holds this file even after playback ended.
        if (loadedTakeId === id) {
          await playback.stop();
          setPlayingTakeId(null);
          setLoadedTakeId(null);
        }
        await deleteTakeFn(id);
        if (target?.localFilePath) {
          await deleteFile(target.localFilePath).catch(() => {
            // best-effort — DB row is already gone, don't block the UI on a stray file
          });
        }
        const rows = bibleTextId !== null ? await loadTakesFn(bibleTextId) : [];
        setTakes(rows);
        if (bibleTextId !== null) {
          await refreshAllTakes(bibleTextId);
        }
        dispatch(
          rows.length > 0
            ? { type: 'REHYDRATE', hasTake: true }
            : { type: 'DELETE' },
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'delete failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      }
    },
    [
      bibleTextId,
      clearStitchQueue,
      loadTakesFn,
      loadedTakeId,
      playback,
      takes,
      deleteTakeFn,
      refreshAllTakes,
    ],
  );

  const selectTake = useCallback(
    async (id: string) => {
      try {
        await selectTakeFn(id);
        if (bibleTextId !== null) {
          setTakes(await loadTakesFn(bibleTextId));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'select failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      }
    },
    [bibleTextId, loadTakesFn, selectTakeFn],
  );

  /** Designate canonical from All Takes (#279) — any account may call this. */
  const setCanonical = useCallback(
    async (id: string) => {
      try {
        await designateCanonicalFn(id);
        if (
          bibleTextId !== null &&
          activeBibleTextIdRef.current === bibleTextId
        ) {
          await refreshAllTakes(bibleTextId);
          if (activeBibleTextIdRef.current === bibleTextId) {
            // Own take list also carries `isCanonical` for the My Takes
            // read-only indicator — refresh it too.
            setTakes(await loadTakesFn(bibleTextId));
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'canonical select failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      }
    },
    [bibleTextId, designateCanonicalFn, loadTakesFn, refreshAllTakes],
  );

  return {
    state,
    takes,
    allTakes,
    hasMultipleRecorders,
    ownCanonicalTakeId,
    selectedTake,
    canRecordNewTake,
    playingTakeId,
    loadedTakeId,
    playbackStatus: playback.status,
    errorMessage,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    start,
    pause,
    resume,
    stop,
    playTake,
    playStitched,
    seek,
    pausePlayback,
    selectTake,
    deleteTake,
    setCanonical,
  };
}
