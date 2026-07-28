import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  addRecordingTake,
  deleteRecordingTake,
  getTakesForVerse,
  selectRecordingTake,
} from '../db/repository';
import type { Recording } from '../types/db/types';
import {
  deleteFile,
  ensureRecordingsDir,
  fileExists,
  fileSize,
  recordingPath,
} from '../utils/audioStorage';
import { ensureSeekableTakeUri } from '../audio/ensureSeekableTakeUri';
import { logger } from '../utils/logger';
import { usePlaybackEngine } from './usePlaybackEngine';
import { useRecordingEngine } from './useRecordingEngine';
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
  deleteTake?: (id: string) => Promise<void>;
  selectTake?: (id: string) => Promise<void>;
};

export type UseVerseAudioArgs = {
  bibleTextId: number | null;
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
  const seekableUri = await ensureSeekableTakeUri(args.tempUri);
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
  persistTake = defaultPersistTake,
  loadTakes = getTakesForVerse,
  deleteTake: deleteTakeFn = deleteRecordingTake,
  selectTake: selectTakeFn = selectRecordingTake,
}: UseVerseAudioArgs) {
  const recording = useRecordingEngine();
  const playback = usePlaybackEngine();
  const [state, dispatch] = useReducer(
    verseAudioReducer,
    'idle' as VerseAudioState,
  );
  const [takes, setTakes] = useState<Recording[]>([]);
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const captureBibleTextIdRef = useRef<number | null>(null);

  const selectedTake = takes.find(t => t.isLatest) ?? null;
  const canRecordNewTake = takes.length < MAX_TAKES;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (bibleTextId === null) {
        setTakes([]);
        dispatch({ type: 'REHYDRATE', hasTake: false });
        return;
      }
      try {
        const rows = await loadTakes(bibleTextId);
        if (cancelled) return;
        setTakes(rows);
        dispatch({ type: 'REHYDRATE', hasTake: rows.length > 0 });
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
  }, [bibleTextId, loadTakes]);

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
      const rows = await loadTakes(id);
      setTakes(rows);
      captureBibleTextIdRef.current = null;
      dispatch({ type: 'SAVED' });
    } catch (error) {
      captureBibleTextIdRef.current = null;
      const message = error instanceof Error ? error.message : 'stop failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [bibleTextId, loadTakes, persistTake, recording]);

  const playTake = useCallback(
    async (take: Recording) => {
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
        dispatch({ type: 'PLAY' });
      } catch (error) {
        setPlayingTakeId(null);
        const message = error instanceof Error ? error.message : 'play failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      }
    },
    [playback],
  );

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
  // PLAYBACK_END. Do not treat brief !playing during load as end — that raced
  // the take UI back to recorded with duration stuck at 0:00.
  useEffect(() => {
    if (state === 'playing' && playback.status === 'idle') {
      dispatch({ type: 'PLAYBACK_END' });
      setPlayingTakeId(null);
    }
  }, [state, playback.status]);

  const deleteTake = useCallback(
    async (id: string) => {
      try {
        const target = takes.find(t => t.id === id);
        if (playingTakeId === id) {
          await playback.stop();
          setPlayingTakeId(null);
        }
        await deleteTakeFn(id);
        if (target?.localFilePath) {
          await deleteFile(target.localFilePath).catch(() => {
            // best-effort — DB row is already gone, don't block the UI on a stray file
          });
        }
        const rows = bibleTextId !== null ? await loadTakes(bibleTextId) : [];
        setTakes(rows);
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
    [bibleTextId, loadTakes, playback, playingTakeId, takes, deleteTakeFn],
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

  return {
    state,
    takes,
    selectedTake,
    canRecordNewTake,
    playingTakeId,
    errorMessage,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    start,
    pause,
    resume,
    stop,
    playTake,
    pausePlayback,
    selectTake,
    deleteTake,
  };
}
