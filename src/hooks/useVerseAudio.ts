import { useCallback, useEffect, useReducer, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  addRecordingTake,
  deleteRecordingTake,
  getLatestRecordingForVerse,
} from '../db/repository';
import type { Recording } from '../types/db/types';
import { ensureRecordingsDir, recordingPath } from '../utils/audioStorage';
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
  await FileSystem.copyAsync({ from: args.tempUri, to: dest });
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
      await recording.start();
      dispatch({ type: 'START' });
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'start failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [bibleTextId, recording]);

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
    if (bibleTextId === null) return;
    try {
      dispatch({ type: 'STOP' });
      const { uri, durationMs } = await recording.stop();
      const saved = await persistTake({
        bibleTextId,
        tempUri: uri,
        durationMs,
      });
      const row =
        (await loadLatest(bibleTextId)) ??
        ({
          id: saved.id,
          bibleTextId,
          localFilePath: saved.localFilePath,
          takeNumber: 1,
          isLatest: true,
          syncStatus: 'pending',
          durationMs,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies Recording);
      setLatest(row);
      dispatch({ type: 'SAVED' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'stop failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [bibleTextId, loadLatest, persistTake, recording]);

  const play = useCallback(async () => {
    if (!latest?.localFilePath) return;
    try {
      await playback.play(latest.localFilePath);
      dispatch({ type: 'PLAY' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'play failed';
      setErrorMessage(message);
      dispatch({ type: 'ERROR', message });
    }
  }, [latest, playback]);

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

  return {
    state,
    latest,
    errorMessage,
    positionMs: playback.positionMs,
    durationMs: playback.durationMs,
    start,
    pause,
    resume,
    stop,
    play,
    deleteCurrent,
  };
}
