import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  addRecordingTake,
  deleteRecordingTake,
  getLatestRecordingForVerse,
} from '../db/repository';
import type { Recording } from '../types/db/types';
import {
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

export type VerseAudioPersistDeps = {
  persistTake?: (args: {
    bibleTextId: number;
    tempUri: string;
    durationMs: number;
  }) => Promise<{ id: string; localFilePath: string }>;
  loadLatest?: (bibleTextId: number) => Promise<Recording | null>;
  deleteTake?: (id: string) => Promise<void>;
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
  await addRecordingTake({
    id,
    bibleTextId: args.bibleTextId,
    localFilePath: dest,
    durationMs: args.durationMs,
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
  loadLatest = getLatestRecordingForVerse,
  deleteTake = deleteRecordingTake,
}: UseVerseAudioArgs) {
  const recording = useRecordingEngine();
  const playback = usePlaybackEngine();
  const [state, dispatch] = useReducer(
    verseAudioReducer,
    'idle' as VerseAudioState,
  );
  const [latest, setLatest] = useState<Recording | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Stable verse id for the in-flight take — stop must not no-op if lookup clears. */
  const captureBibleTextIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (bibleTextId === null) {
        setLatest(null);
        dispatch({ type: 'REHYDRATE', hasTake: false });
        return;
      }
      try {
        const row = await loadLatest(bibleTextId);
        if (cancelled) return;
        setLatest(row);
        dispatch({ type: 'REHYDRATE', hasTake: Boolean(row) });
      } catch (error) {
        log.error('Failed to load latest take', { error });
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
  }, [bibleTextId, loadLatest]);

  const start = useCallback(async () => {
    if (bibleTextId === null) return;
    try {
      // Stop review playback first so re-record from `playing` can transition
      // and so audio mode is free for the mic (see createRecordingEngine).
      try {
        await playback.stop();
      } catch {
        // Ignore — recorder start below is what matters.
      }
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
  }, [bibleTextId, playback, recording]);

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
      // Release the native mic first so captureActive / navigation guards only
      // clear after Android no longer considers us recording.
      const { uri, durationMs } = await recording.stop();
      dispatch({ type: 'STOP' });
      const saved = await persistTake({
        bibleTextId: id,
        tempUri: uri,
        durationMs,
      });
      const row =
        (await loadLatest(id)) ??
        ({
          id: saved.id,
          bibleTextId: id,
          localFilePath: saved.localFilePath,
          takeNumber: 1,
          isLatest: true,
          syncStatus: 'pending',
          durationMs,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies Recording);
      setLatest(row);
      captureBibleTextIdRef.current = null;
      dispatch({ type: 'SAVED' });
    } catch (error) {
      captureBibleTextIdRef.current = null;
      const message = error instanceof Error ? error.message : 'stop failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [bibleTextId, loadLatest, persistTake, recording]);

  const play = useCallback(async () => {
    if (!latest?.localFilePath) return;
    try {
      const path = latest.localFilePath;
      const exists = await fileExists(path);
      if (!exists) {
        throw new Error('Take file is missing on disk. Re-record this verse.');
      }
      const size = await fileSize(path);
      if (size === undefined || size <= 0) {
        throw new Error('Take file is empty (0 bytes). Re-record this verse.');
      }
      setErrorMessage(null);
      // Dispatch PLAY only after the engine confirms load + non-zero duration
      // so the take row never shows "playing" stuck at 0:00.
      await playback.play(path);
      dispatch({ type: 'PLAY' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'play failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [latest, playback]);

  /**
   * Review scrub (#176): seek the loaded take (loads without playing if needed).
   * Accurate absolute seek needs a seekable container (`.m4a`); ADTS remux is #233.
   */
  const seek = useCallback(
    async (ms: number) => {
      if (!latest?.localFilePath) return;
      try {
        const path = latest.localFilePath;
        const exists = await fileExists(path);
        if (!exists) {
          throw new Error(
            'Take file is missing on disk. Re-record this verse.',
          );
        }
        setErrorMessage(null);
        await playback.load(path);
        const capped =
          typeof latest.durationMs === 'number' && latest.durationMs > 0
            ? Math.min(Math.max(0, ms), latest.durationMs)
            : Math.max(0, ms);
        await playback.seek(capped);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'seek failed';
        setErrorMessage(message);
        dispatch({ type: 'ERROR', message });
      }
    },
    [latest, playback],
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
  // PLAYBACK_END. Do not treat brief !playing during load as end — that raced
  // the take UI back to recorded with duration stuck at 0:00.
  useEffect(() => {
    if (state === 'playing' && playback.status === 'idle') {
      dispatch({ type: 'PLAYBACK_END' });
    }
  }, [state, playback.status]);

  const deleteCurrent = useCallback(async () => {
    try {
      await playback.stop();
      if (latest) {
        await deleteTake(latest.id);
      }
      setLatest(null);
      dispatch({ type: 'DELETE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delete failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [deleteTake, latest, playback]);

  // Prefer live player duration; fall back to DB duration from capture so the
  // take row can show a real length before/without a successful play().
  const storedDurationMs =
    typeof latest?.durationMs === 'number' && latest.durationMs > 0
      ? latest.durationMs
      : 0;
  const durationMs =
    playback.durationMs > 0 ? playback.durationMs : storedDurationMs;

  return {
    state,
    latest,
    errorMessage,
    positionMs: playback.positionMs,
    durationMs,
    start,
    pause,
    resume,
    stop,
    play,
    seek,
    pausePlayback,
    deleteCurrent,
  };
}
