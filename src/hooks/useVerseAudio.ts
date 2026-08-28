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

const log = logger.create('useVerseAudio');
const MAX_TAKES = 5;

export type VerseAudioPersistDeps = {
  persistTake?: (args: {
    bibleTextId: number;
    tempUri: string;
    durationMs: number;
  }) => Promise<{ id: string; localFilePath: string }>;
  loadTakes?: (bibleTextId: number) => Promise<Recording[]>;
  loadAllTakes?: (bibleTextId: number) => Promise<RecordingWithOwner[]>;
  checkMultipleRecorders?: (bibleTextId: number) => Promise<boolean>;
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
} & VerseAudioPersistDeps;

async function defaultPersistTake(args: {
  bibleTextId: number;
  tempUri: string;
  durationMs: number;
}): Promise<{ id: string; localFilePath: string }> {
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
    localFilePath: dest,
    durationMs: args.durationMs,
    fileSizeBytes,
  });
  return { id, localFilePath: dest };
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
  persistTake = defaultPersistTake,
  loadTakes = getTakesForVerse,
  loadAllTakes = getAllTakesForVerse,
  checkMultipleRecorders = verseHasMultipleRecorders,
  deleteTake: deleteTakeFn = deleteRecordingTake,
  selectTake: selectTakeFn = selectRecordingTake,
  designateCanonical: designateCanonicalFn = setCanonicalTake,
}: UseVerseAudioArgs) {
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
  const captureBibleTextIdRef = useRef<number | null>(null);
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

  useEffect(() => {
    chapterAssignedRef.current = false;
  }, [chapterAssignmentId]);

  const selectedTake = takes.find(t => t.isSelected) ?? null;
  const canRecordNewTake = takes.length < MAX_TAKES;
  const ownCanonicalTakeId = takes.find(t => t.isCanonical)?.id ?? null;

  const refreshAllTakes = useCallback(
    async (id: number) => {
      const requestId = ++allTakesRequestIdRef.current;
      try {
        const [rows, multi] = await Promise.all([
          loadAllTakes(id),
          checkMultipleRecorders(id),
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
    [loadAllTakes, checkMultipleRecorders],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadedTakeId(null);
    activeBibleTextIdRef.current = bibleTextId;
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
        const rows = await loadTakes(bibleTextId);
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
  }, [bibleTextId, loadTakes, refreshAllTakes]);

  const start = useCallback(async () => {
    if (bibleTextId === null) return;

    if (!canRecordNewTake) {
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
      captureBibleTextIdRef.current = bibleTextId;
      await recording.start();
      dispatch({ type: 'START' });
      setErrorMessage(null);
    } catch (error) {
      captureBibleTextIdRef.current = null;
      const message = error instanceof Error ? error.message : 'start failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [bibleTextId, canRecordNewTake, playback, recording]);

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
    const id = captureBibleTextIdRef.current ?? bibleTextId;
    if (id === null) return;
    try {
      const { uri, durationMs } = await recording.stop();
      dispatch({ type: 'STOP' });
      await persistTake({ bibleTextId: id, tempUri: uri, durationMs });

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

      const rows = await loadTakes(id);
      setTakes(rows);
      await refreshAllTakes(id);
      captureBibleTextIdRef.current = null;
      dispatch({ type: 'SAVED' });
    } catch (error) {
      captureBibleTextIdRef.current = null;
      const message = error instanceof Error ? error.message : 'stop failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [
    bibleTextId,
    chapterAssignmentId,
    chapterClaim,
    loadTakes,
    onChapterClaimed,
    persistTake,
    recording,
    userId,
    refreshAllTakes,
  ]);

  const playTake = useCallback(
    async (take: Recording) => {
      playbackLoadInFlightRef.current = true;
      try {
        const path = take.localFilePath;
        const exists = await fileExists(path);
        if (!exists) {
          throw new Error(
            'Take file is missing on disk. Re-record this verse.',
          );
        }
        const size = await fileSize(path);
        if (size === undefined || size <= 0) {
          throw new Error(
            'Take file is empty (0 bytes). Re-record this verse.',
          );
        }
        setErrorMessage(null);
        await playback.play(path);
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
    [playback],
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
    [loadedTakeId, playback, selectedTake, takes],
  );

  /** Pause draft review playback (design review control shows Pause while playing). */
  const pausePlayback = useCallback(async () => {
    try {
      await playback.pause();
      dispatch({ type: 'PLAYBACK_END' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'pause playback failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [playback]);

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
    dispatch({ type: 'PLAYBACK_END' });
    setPlayingTakeId(null);
  }, [state, playback.status, playbackLoadGate]);

  const deleteTake = useCallback(
    async (id: string) => {
      try {
        const target = takes.find(t => t.id === id);
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
        const rows = bibleTextId !== null ? await loadTakes(bibleTextId) : [];
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
      loadTakes,
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
          setTakes(await loadTakes(bibleTextId));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'select failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      }
    },
    [bibleTextId, loadTakes, selectTakeFn],
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
            setTakes(await loadTakes(bibleTextId));
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'canonical select failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      }
    },
    [bibleTextId, designateCanonicalFn, loadTakes, refreshAllTakes],
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
    errorMessage,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    start,
    pause,
    resume,
    stop,
    playTake,
    seek,
    pausePlayback,
    selectTake,
    deleteTake,
    setCanonical,
  };
}
