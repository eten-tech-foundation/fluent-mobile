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
 * A partial take captured before the recorder was paused (manually or by
 * backgrounding). Persisted by the adapter so an in-flight take survives a
 * process kill; the `startedAt`/`elapsedMs` pair rehydrates the timer on mount.
 */
export interface PausedTakeState {
  fileUri: string;
  elapsedMs: number;
  startedAt: string;
  /** Present on markers written during a live session; absent on legacy markers. */
  sessionToken?: string;
}

/**
 * Use-case adapter injected into {@link useRecorder}. It isolates every concern
 * the generic recorder does not own: which session a take belongs to, how a
 * committed take is persisted/resolved/deleted, and where paused-take markers
 * live. The recorder itself stays agnostic of the DB, storage layout, and any
 * domain vocabulary.
 *
 * `sessionKey === null` keeps the recorder inert until the caller resolves a
 * target (e.g. a selected verse).
 */
export interface RecorderAdapter<T> {
  sessionKey: number | string | null;
  /** Load the most recent committed take for the session, if any. */
  loadInitial: (key: number | string) => Promise<T | null>;
  /**
   * Persist a freshly stopped take. Return the committed take on success, or
   * `null` to signal a recoverable failure (the recorder reverts to its prior
   * state). Throwing is also treated as a recoverable failure.
   */
  onCommit: (args: {
    fileUri: string;
    durationMs: number;
  }) => Promise<T | null>;
  /** Delete a committed take (row + file). */
  deleteCommitted: (take: T) => Promise<void>;
  /** Resolve a committed take to an absolute, playable uri. */
  resolvePlaybackUri: (take: T) => string | null;
  /** Read the paused-take marker for the session, if one exists. */
  loadPaused: (key: number | string) => PausedTakeState | null;
  /** Write the paused-take marker for the current session. */
  persistPaused: (state: PausedTakeState) => void;
  /** Clear the paused-take marker for the current session. */
  clearPaused: () => void;
  /** Best-effort unlink of a paused partial file being discarded. */
  deletePausedFile: (fileUri: string) => void;
}

export interface UseRecorderApi<T> {
  status: RecorderStatus;
  elapsedMs: number;
  permission: PermissionState;
  currentRecording: T | null;
  isReady: boolean;
  /** False when a paused take was rehydrated from storage (no live native session). */
  canResume: boolean;
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

function createLiveSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface PermissionLike {
  granted: boolean;
  canAskAgain?: boolean;
}

function mapPermissionState(response: PermissionLike): PermissionState {
  if (response.granted) return 'granted';
  if (response.canAskAgain === false) return 'blocked';
  return 'denied';
}

/**
 * Wraps `expo-audio`'s recorder and player primitives with the state machine
 * described in issue #49: Idle -> Recording -> Paused -> Review, plus
 * Re-record and Delete transitions from Review.
 *
 * The hook owns only recording mechanics — the state machine, elapsed-time
 * ticking, permissions, background auto-pause, and playback orchestration. All
 * persistence, storage layout, and domain identity is injected via a
 * {@link RecorderAdapter}, so the recorder is reusable across use cases.
 *
 * `adapter.sessionKey === null` keeps the recorder inert until a target is
 * resolved.
 */
export function useRecorder<T>(adapter: RecorderAdapter<T>): UseRecorderApi<T> {
  const { sessionKey } = adapter;

  // Capture straight into the durable document directory (not the evictable
  // cache) so paused/backgrounded partial takes survive until we move or delete
  // them. Committed takes are relocated into the organized tree on Stop.
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
  });

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<T | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [canResume, setCanResume] = useState(false);

  // The adapter is read via a ref inside callbacks/effects so they always see
  // the latest injected closures without being re-created (and re-subscribing)
  // on every render.
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  // Playback is a separate concern with a one-way dependency: it takes the
  // reviewed take's URI and knows nothing about the recorder. The recorder
  // orchestrates it explicitly (stopping playback before re-record/delete).
  // The adapter resolves a committed take to an absolute uri.
  const {
    isPlaying,
    toggle: togglePlaybackInternal,
    stop: stopPlayback,
  } = useDraftPlayback(
    currentRecording
      ? adapterRef.current.resolvePlaybackUri(currentRecording)
      : null,
  );

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);
  // `baseElapsedRef` accumulates the recorded milliseconds of all previous
  // active segments (i.e. everything up to the most recent pause). The current
  // segment's contribution is measured by wall clock via `runningSinceRef`.
  const baseElapsedRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);
  const liveSessionTokenRef = useRef<string | null>(null);
  const sessionKeyRef = useRef<number | string | null>(sessionKey);

  sessionKeyRef.current = sessionKey;

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

  // Load the latest committed take for the current session and reset state.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsReady(false);
      setCanResume(false);
      setElapsedMs(0);
      baseElapsedRef.current = 0;
      runningSinceRef.current = null;
      startedAtRef.current = null;
      liveSessionTokenRef.current = null;
      clearTick();

      if (sessionKey === null) {
        setStatus('idle');
        setCurrentRecording(null);
        return;
      }

      const currentAdapter = adapterRef.current;
      const [latest, paused] = await Promise.all([
        currentAdapter.loadInitial(sessionKey),
        Promise.resolve(currentAdapter.loadPaused(sessionKey)),
      ]);

      if (cancelled) return;

      setCurrentRecording(latest);

      if (paused) {
        // Restored markers have no live native recorder — resume is blocked;
        // the UI should steer the user toward discardPaused instead.
        liveSessionTokenRef.current = null;
        setCanResume(false);
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
      log.error('Failed to load recorder state', { sessionKey, error });
    });

    return () => {
      cancelled = true;
    };
  }, [sessionKey, clearTick]);

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
      const currentSessionKey = sessionKeyRef.current;
      const sessionToken = liveSessionTokenRef.current;
      if (currentSessionKey === null || !rec.uri || sessionToken === null)
        return;
      const startedAt = startedAtRef.current ?? new Date().toISOString();
      startedAtRef.current = startedAt;
      adapterRef.current.persistPaused({
        fileUri: rec.uri,
        elapsedMs: elapsed,
        startedAt,
        sessionToken,
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
    liveSessionTokenRef.current = createLiveSessionToken();
    setCanResume(false);
    baseElapsedRef.current = 0;
    runningSinceRef.current = Date.now();
    startedAtRef.current = new Date().toISOString();
    setElapsedMs(0);
    recorder.record();
    setStatus('recording');
    startTicking();
  }, [recorder, startTicking]);

  const start = useCallback(async () => {
    const currentSessionKey = sessionKeyRef.current;
    if (currentSessionKey === null) return;
    if (permission !== 'granted') {
      const { granted } = await requestPermission();
      if (!granted) return;
    }
    await startRecordingSession();
  }, [permission, requestPermission, startRecordingSession]);

  const pauseInternal = useCallback(async () => {
    const currentSessionKey = sessionKeyRef.current;
    if (currentSessionKey === null) return;
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
    setCanResume(liveSessionTokenRef.current !== null);
    persistPausedMarker(recorder, finalElapsed);
  }, [clearTick, persistPausedMarker, recorder, status]);

  const pause = useCallback(async () => {
    await pauseInternal();
  }, [pauseInternal]);

  const resume = useCallback(async () => {
    if (status !== 'paused' || liveSessionTokenRef.current === null) return;
    recorder.record();
    runningSinceRef.current = Date.now();
    setStatus('recording');
    setCanResume(false);
    startTicking();
  }, [recorder, startTicking, status]);

  const commitRecording = useCallback(async () => {
    const currentSessionKey = sessionKeyRef.current;
    if (currentSessionKey === null) return;

    // Compute the final duration from refs before stopping so a late tick
    // or a stale `elapsedMs` render can't skew what lands in storage.
    const segmentStart = runningSinceRef.current;
    const activeSegmentMs =
      segmentStart === null ? 0 : Date.now() - segmentStart;
    const duration = baseElapsedRef.current + activeSegmentMs;

    await recorder.stop();
    clearTick();

    const fileUri = recorder.uri;
    if (!fileUri) {
      log.error('Recorder returned no URI on stop; skipping commit');
      setStatus(currentRecording ? 'review' : 'idle');
      return;
    }

    let committed: T | null;
    try {
      committed = await adapterRef.current.onCommit({
        fileUri,
        durationMs: duration,
      });
    } catch (error) {
      log.error('Failed to commit recording', {
        sessionKey: currentSessionKey,
        error,
      });
      setStatus(currentRecording ? 'review' : 'idle');
      return;
    }

    if (!committed) {
      setStatus(currentRecording ? 'review' : 'idle');
      return;
    }

    adapterRef.current.clearPaused();
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
    startedAtRef.current = null;
    liveSessionTokenRef.current = null;
    setCanResume(false);
    setElapsedMs(duration);
    setCurrentRecording(committed);
    setStatus('review');
  }, [clearTick, currentRecording, recorder]);

  const stop = useCallback(async () => {
    if (status !== 'recording' && status !== 'paused') return;
    if (status === 'paused' && liveSessionTokenRef.current === null) return;
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
    await adapterRef.current.deleteCommitted(currentRecording);
    setCurrentRecording(null);
    setStatus('idle');
    setElapsedMs(0);
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
  }, [currentRecording, status, stopPlayback]);

  const discardPaused = useCallback(async () => {
    const currentSessionKey = sessionKeyRef.current;
    if (currentSessionKey === null) return;
    // Read the marker before clearing so we can unlink the durable partial file
    // (recorder.uri is unreliable after a process kill; the marker is not).
    const marker = adapterRef.current.loadPaused(currentSessionKey);
    try {
      await recorder.stop();
    } catch (error) {
      log.warn('Recorder stop while discarding paused take failed', { error });
    }
    if (marker?.fileUri) adapterRef.current.deletePausedFile(marker.fileUri);
    adapterRef.current.clearPaused();
    clearTick();
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
    startedAtRef.current = null;
    liveSessionTokenRef.current = null;
    setCanResume(false);
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
    canResume,
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
