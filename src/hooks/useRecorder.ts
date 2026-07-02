import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';
import { randomUUID } from 'expo-crypto';
import { deleteRecordingById, insertRecording } from '../db/repository';
import { getLatestRecordingForVerse } from '../db/queries';
import {
  clearPausedTake,
  getPausedTake,
  setPausedTake,
} from '../services/storage';
import {
  buildRecordingKey,
  extensionFromUri,
  moveIntoStore,
  resolveRecordingUri,
} from '../services/recordingStorage';
import type { Recording } from '../types/db/types';
import { logger } from '../utils/logger';
import { useDraftPlayback } from './useDraftPlayback';

const log = logger.create('useRecorder');

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'review';
/**
 * Microphone permission state.
 * - `unknown`  — hook still probing the OS.
 * - `granted`  — user has granted microphone access.
 * - `denied`   — not granted, but the OS will still show a prompt on request.
 * - `blocked`  — permanently denied; OS suppresses the prompt, only Settings recovers.
 */
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'blocked';

export interface PermissionRequestResult {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Wraps `expo-audio`'s recorder and player primitives with the state machine
 * described in issue #49: Idle -> Recording -> Paused -> Review, plus
 * Re-record and Delete transitions from Review.
 *
 * `bibleTextId === null` keeps the recorder inert until a verse is resolved.
 *
 * The remaining fields are attribution context used to build the durable file
 * path and persist who/where a take belongs to; they are optional so the hook
 * stays usable in isolation (e.g. tests), falling back to placeholder segments.
 */
export interface UseRecorderArgs {
  bibleTextId: number | null;
  userId?: string;
  projectId?: number | null;
  chapterAssignmentId?: number | null;
  bookCode?: string | null;
  chapterNumber?: number | null;
  verseNumber?: number | null;
}

export interface UseRecorderApi {
  status: RecorderStatus;
  elapsedMs: number;
  permission: PermissionState;
  currentRecording: Recording | null;
  isReady: boolean;
  isPlaying: boolean;

  requestPermission: () => Promise<PermissionRequestResult>;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  reRecord: () => Promise<void>;
  deleteCurrent: () => Promise<void>;
  discardPaused: () => Promise<void>;
  togglePlayback: () => Promise<void>;
  stopPlayback: () => void;
}

// 50ms tick gives ~20fps on the centiseconds portion of the duration display
// (`MM:SS:HH`) without hammering the React state.
const TICK_INTERVAL_MS = 50;

interface PermissionLike {
  granted: boolean;
  canAskAgain?: boolean;
}

function mapPermissionState(response: PermissionLike): PermissionState {
  if (response.granted) return 'granted';
  if (response.canAskAgain === false) return 'blocked';
  return 'denied';
}

export function useRecorder({
  bibleTextId,
  userId,
  projectId,
  chapterAssignmentId,
  bookCode,
  chapterNumber,
  verseNumber,
}: UseRecorderArgs): UseRecorderApi {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(
    null,
  );
  const [isReady, setIsReady] = useState(false);

  // Playback is a separate concern with a one-way dependency: it takes the
  // reviewed take's URI and knows nothing about the recorder. The recorder
  // orchestrates it explicitly (stopping playback before re-record/delete).
  // Stored paths are relative keys, so resolve to an absolute uri here.
  const {
    isPlaying,
    toggle: togglePlaybackInternal,
    stop: stopPlayback,
  } = useDraftPlayback(
    currentRecording
      ? resolveRecordingUri(currentRecording.localFilePath)
      : null,
  );

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);
  // `baseElapsedRef` accumulates the recorded milliseconds of all previous
  // active segments (i.e. everything up to the most recent pause). The current
  // segment's contribution is measured by wall clock via `runningSinceRef`.
  const baseElapsedRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);
  const bibleTextIdRef = useRef<number | null>(bibleTextId);

  bibleTextIdRef.current = bibleTextId;

  // Attribution context is read via a ref so the commit callback always sees the
  // latest values without being re-created (and re-subscribing) on every render.
  const contextRef = useRef({
    userId,
    projectId,
    chapterAssignmentId,
    bookCode,
    chapterNumber,
    verseNumber,
  });
  contextRef.current = {
    userId,
    projectId,
    chapterAssignmentId,
    bookCode,
    chapterNumber,
    verseNumber,
  };

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTicking = useCallback(() => {
    clearTick();
    tickRef.current = setInterval(() => {
      const startedAt = runningSinceRef.current;
      if (startedAt === null) return;
      setElapsedMs(baseElapsedRef.current + (Date.now() - startedAt));
    }, TICK_INTERVAL_MS);
  }, [clearTick]);

  // Load latest DB recording for the current verse and reset state.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsReady(false);
      setElapsedMs(0);
      baseElapsedRef.current = 0;
      runningSinceRef.current = null;
      startedAtRef.current = null;
      clearTick();

      if (bibleTextId === null) {
        setStatus('idle');
        setCurrentRecording(null);
        return;
      }

      const [latest, paused] = await Promise.all([
        getLatestRecordingForVerse(bibleTextId),
        Promise.resolve(getPausedTake(bibleTextId)),
      ]);

      if (cancelled) return;

      setCurrentRecording(latest);

      if (paused) {
        // Surface the marker so the UI can prompt Resume/Discard on next mount.
        setStatus('paused');
        setElapsedMs(paused.elapsedMs);
        baseElapsedRef.current = paused.elapsedMs;
        startedAtRef.current = paused.startedAt;
      } else {
        setStatus(latest ? 'review' : 'idle');
      }
      setIsReady(true);
    }

    load().catch(error => {
      log.error('Failed to load recorder state', { bibleTextId, error });
    });

    return () => {
      cancelled = true;
    };
  }, [bibleTextId, clearTick]);

  // Ensure permission state is populated without prompting the user.
  useEffect(() => {
    let cancelled = false;
    getRecordingPermissionsAsync()
      .then(response => {
        if (cancelled) return;
        setPermission(mapPermissionState(response));
      })
      .catch(error => log.error('Failed to check mic permission', { error }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-pause when the app is backgrounded mid-recording.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState !== 'active' && status === 'recording') {
          pauseInternal().catch(error =>
            log.error('Auto-pause on background failed', { error }),
          );
        }
      },
    );
    return () => subscription.remove();
    // pauseInternal is stable via closure and eslint-disable to avoid re-subscribing every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => () => clearTick(), [clearTick]);

  const persistPausedMarker = useCallback(
    (rec: AudioRecorder, elapsed: number) => {
      const currentBibleTextId = bibleTextIdRef.current;
      if (currentBibleTextId === null || !rec.uri) return;
      const startedAt = startedAtRef.current ?? new Date().toISOString();
      startedAtRef.current = startedAt;
      setPausedTake({
        bibleTextId: currentBibleTextId,
        fileUri: rec.uri,
        elapsedMs: elapsed,
        startedAt,
      });
    },
    [],
  );

  const requestPermission =
    useCallback(async (): Promise<PermissionRequestResult> => {
      const response = await requestRecordingPermissionsAsync();
      setPermission(mapPermissionState(response));
      return {
        granted: response.granted,
        canAskAgain: response.canAskAgain ?? true,
      };
    }, []);

  const startRecordingSession = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    baseElapsedRef.current = 0;
    runningSinceRef.current = Date.now();
    startedAtRef.current = new Date().toISOString();
    setElapsedMs(0);
    recorder.record();
    setStatus('recording');
    startTicking();
  }, [recorder, startTicking]);

  const start = useCallback(async () => {
    const currentBibleTextId = bibleTextIdRef.current;
    if (currentBibleTextId === null) return;
    if (permission !== 'granted') {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    await startRecordingSession();
  }, [permission, requestPermission, startRecordingSession]);

  const pauseInternal = useCallback(async () => {
    const currentBibleTextId = bibleTextIdRef.current;
    if (currentBibleTextId === null) return;
    if (status !== 'recording') return;

    const segmentStart = runningSinceRef.current;
    const segmentElapsed =
      segmentStart === null ? 0 : Date.now() - segmentStart;
    const finalElapsed = baseElapsedRef.current + segmentElapsed;
    recorder.pause();
    clearTick();
    baseElapsedRef.current = finalElapsed;
    runningSinceRef.current = null;
    setElapsedMs(finalElapsed);
    setStatus('paused');
    persistPausedMarker(recorder, finalElapsed);
  }, [clearTick, persistPausedMarker, recorder, status]);

  const pause = useCallback(async () => {
    await pauseInternal();
  }, [pauseInternal]);

  const resume = useCallback(async () => {
    if (status !== 'paused') return;
    recorder.record();
    runningSinceRef.current = Date.now();
    setStatus('recording');
    startTicking();
  }, [recorder, startTicking, status]);

  const commitRecording = useCallback(async () => {
    const currentBibleTextId = bibleTextIdRef.current;
    if (currentBibleTextId === null) return;

    // Compute the final duration from refs before stopping so a late tick
    // or a stale `elapsedMs` render can't skew what lands in the DB.
    const segmentStart = runningSinceRef.current;
    const activeSegmentMs =
      segmentStart === null ? 0 : Date.now() - segmentStart;
    const duration = baseElapsedRef.current + activeSegmentMs;

    await recorder.stop();
    clearTick();

    const fileUri = recorder.uri;
    if (!fileUri) {
      log.error('Recorder returned no URI on stop; skipping DB write');
      setStatus(currentRecording ? 'review' : 'idle');
      return;
    }

    const recordingId = randomUUID();
    const context = contextRef.current;
    const key = buildRecordingKey({
      userId: context.userId ?? '',
      projectId: context.projectId ?? 0,
      bookCode: context.bookCode ?? '',
      chapterNumber: context.chapterNumber ?? 0,
      verseNumber: context.verseNumber ?? 0,
      recordingId,
      extension: extensionFromUri(fileUri),
    });

    // Move the take out of the evictable cache before recording it in the DB so
    // a row never points at a file the OS could reclaim.
    let moved;
    try {
      moved = await moveIntoStore({ sourceUri: fileUri, key });
    } catch (error) {
      log.error('Failed to move recording into durable store', {
        bibleTextId: currentBibleTextId,
        error,
      });
      setStatus(currentRecording ? 'review' : 'idle');
      return;
    }

    const inserted = await insertRecording({
      id: recordingId,
      bibleTextId: currentBibleTextId,
      userId: context.userId ?? null,
      chapterAssignmentId: context.chapterAssignmentId ?? null,
      localFilePath: moved.key,
      durationMs: duration,
      fileSizeBytes: moved.sizeBytes,
    });

    clearPausedTake(currentBibleTextId);
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
    startedAtRef.current = null;
    setElapsedMs(duration);
    setCurrentRecording(inserted);
    setStatus('review');
  }, [clearTick, currentRecording, recorder]);

  const stop = useCallback(async () => {
    if (status !== 'recording' && status !== 'paused') return;
    await commitRecording();
  }, [commitRecording, status]);

  const reRecord = useCallback(async () => {
    if (status !== 'review') return;
    stopPlayback();
    if (permission !== 'granted') {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    await startRecordingSession();
  }, [
    permission,
    requestPermission,
    startRecordingSession,
    status,
    stopPlayback,
  ]);

  const deleteCurrent = useCallback(async () => {
    if (status !== 'review' || !currentRecording) return;
    stopPlayback();
    await deleteRecordingById(currentRecording.id);
    setCurrentRecording(null);
    setStatus('idle');
    setElapsedMs(0);
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
  }, [currentRecording, status, stopPlayback]);

  const discardPaused = useCallback(async () => {
    const currentBibleTextId = bibleTextIdRef.current;
    if (currentBibleTextId === null) return;
    try {
      await recorder.stop();
    } catch (error) {
      log.warn('Recorder stop while discarding paused take failed', { error });
    }
    clearPausedTake(currentBibleTextId);
    clearTick();
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
    startedAtRef.current = null;
    setElapsedMs(0);
    setStatus(currentRecording ? 'review' : 'idle');
  }, [clearTick, currentRecording, recorder]);

  const togglePlayback = useCallback(async () => {
    if (status !== 'review' || !currentRecording) return;
    await togglePlaybackInternal();
  }, [currentRecording, status, togglePlaybackInternal]);

  return {
    status,
    elapsedMs,
    permission,
    currentRecording,
    isReady,
    isPlaying,
    requestPermission,
    start,
    pause,
    resume,
    stop,
    reRecord,
    deleteCurrent,
    discardPaused,
    togglePlayback,
    stopPlayback,
  };
}
