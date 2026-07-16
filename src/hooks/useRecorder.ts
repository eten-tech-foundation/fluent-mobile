import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { logger } from '../utils/logger';
import { useAudioPlayback } from './useAudioPlayback';
import type { UseAudioPlaybackApi } from './useAudioPlayback';
import type { Recording } from '../types/db/types';
import { RecorderStatus } from '../types/recording/types';

const log = logger.create('useRecorder');

export { RecorderStatus };
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
 *
 * `segments` is the ordered list of audio files that make up the take — one per
 * app-lifetime recording session. A live session is a single segment; resuming
 * after a process kill appends a new segment. They are concatenated on stop.
 */
export interface PausedTakeState {
  segments: string[];
  elapsedMs: number;
  startedAt: string;
  /** Present on markers written during a live session; absent once rehydrated. */
  sessionToken?: string;
}

/**
 * Persistence + identity hooks for the verse recorder session. Not a generic
 * multi-use-case framework — only {@link useVerseRecorder} builds this.
 */
export interface RecordingSessionDeps {
  sessionKey: string | null;
  loadInitial: () => Promise<Recording | null>;
  onCommit: (args: {
    fileUris: string[];
    durationMs: number;
  }) => Promise<Recording | null>;
  deleteCommitted: (take: Recording) => Promise<void>;
  resolvePlaybackUri: (take: Recording) => string | null;
  resolveDurationMs?: (take: Recording) => number | null;
  loadPaused: () => PausedTakeState | null;
  persistPaused: (state: PausedTakeState) => void;
  clearPaused: () => void;
  deletePausedFiles: (fileUris: string[]) => void;
}

export interface UseRecorderApi {
  status: RecorderStatus;
  elapsedMs: number;
  permission: PermissionState;
  currentRecording: Recording | null;
  isReady: boolean;
  /** True while a paused take can be resumed (always true once paused). */
  canResume: boolean;
  /**
   * True when the current paused take was rehydrated from storage after a
   * process kill (no live native session). Resuming opens a new segment; the UI
   * should also offer Discard.
   */
  isRecovered: boolean;
  /**
   * Playback of the committed take under review (play/pause + rewind-on-finish).
   * Seek/scrub is deferred until committed takes are remuxed to seekable M4A (#176).
   */
  playback: Pick<UseAudioPlaybackApi, 'isPlaying' | 'toggle' | 'stop'>;

  requestPermission: () => Promise<PermissionRequestResult>;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  reRecord: () => Promise<void>;
  deleteCurrent: () => Promise<void>;
  discardPaused: () => Promise<void>;
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
 * persistence is supplied by useVerseRecorder through RecordingSessionDeps.
 *
 * `deps.sessionKey === null` keeps the recorder inert until a target is
 * resolved.
 */
export function useRecorder(deps: RecordingSessionDeps): UseRecorderApi {
  const { sessionKey } = deps;

  // Capture straight into the durable document directory (not the evictable
  // cache) so paused/backgrounded partial takes survive until we move or delete
  // them. Committed takes are relocated into the organized tree on Stop.
  //
  // Record as ADTS AAC (`.aac`) rather than the preset's `.m4a`: an MP4/M4A file
  // is only valid once its `moov` atom is written on a clean stop(), so a
  // process kill leaves it unplayable and un-appendable. ADTS is a self-framing
  // stream — a killed segment stays playable and multiple segments concatenate
  // by byte append, which is what makes resume-after-kill possible.
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    extension: '.aac',
    android: { outputFormat: 'aac_adts', audioEncoder: 'aac' },
    directory: 'document',
  });

  const [status, setStatus] = useState<RecorderStatus>(RecorderStatus.Idle);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(
    null,
  );
  const [isReady, setIsReady] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [isRecovered, setIsRecovered] = useState(false);

  // The adapter is read via a ref inside callbacks/effects so they always see
  // the latest injected closures without being re-created (and re-subscribing)
  // on every render.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Playback is a separate concern with a one-way dependency: it takes the
  // reviewed take's URI and knows nothing about the recorder. The recorder
  // orchestrates it explicitly (stopping playback before re-record/delete).
  // The adapter resolves a committed take to an absolute uri.
  const {
    isPlaying,
    toggle: togglePlaybackInternal,
    stop: stopPlayback,
  } = useAudioPlayback(
    currentRecording
      ? depsRef.current.resolvePlaybackUri(currentRecording)
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
  // Ordered audio files that make up the in-flight take (one per app-lifetime
  // recording session). Concatenated on stop; unlinked on discard.
  const segmentsRef = useRef<string[]>([]);
  const sessionKeyRef = useRef<string | null>(sessionKey);

  sessionKeyRef.current = sessionKey;

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Persist the in-flight take's manifest (segments + accumulated elapsed +
  // start time). Written at session start and on pause, so a hard process kill
  // — which may not give the background auto-pause a chance to run — still
  // leaves a recoverable marker. No-op until a live session owns at least one
  // segment.
  const persistLiveMarker = useCallback((elapsed: number) => {
    const currentSessionKey = sessionKeyRef.current;
    const sessionToken = liveSessionTokenRef.current;
    if (
      currentSessionKey === null ||
      sessionToken === null ||
      segmentsRef.current.length === 0
    )
      return;
    const startedAt = startedAtRef.current ?? new Date().toISOString();
    startedAtRef.current = startedAt;
    depsRef.current.persistPaused({
      segments: segmentsRef.current,
      elapsedMs: elapsed,
      startedAt,
      sessionToken,
    });
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
      setIsRecovered(false);
      setElapsedMs(0);
      baseElapsedRef.current = 0;
      runningSinceRef.current = null;
      startedAtRef.current = null;
      liveSessionTokenRef.current = null;
      segmentsRef.current = [];
      clearTick();

      if (sessionKey === null) {
        setStatus(RecorderStatus.Idle);
        setCurrentRecording(null);
        return;
      }

      const currentDeps = depsRef.current;
      const [latest, paused] = await Promise.all([
        currentDeps.loadInitial(),
        Promise.resolve(currentDeps.loadPaused()),
      ]);

      if (cancelled) return;

      setCurrentRecording(latest);

      if (paused) {
        // Restored markers have no live native recorder session, but the take
        // is still resumable: resume() records a NEW segment appended to the
        // rehydrated ones. `liveSessionTokenRef` stays null so resume() knows to
        // open a fresh session rather than resume the (nonexistent) native one.
        liveSessionTokenRef.current = null;
        segmentsRef.current = paused.segments;
        setCanResume(true);
        setIsRecovered(true);
        setStatus(RecorderStatus.Paused);
        setElapsedMs(paused.elapsedMs);
        baseElapsedRef.current = paused.elapsedMs;
        startedAtRef.current = paused.startedAt;
      } else {
        // Show the persisted (audio-derived) duration for a reloaded take so
        // the Review timer isn't stuck at 0:00 after remount.
        setElapsedMs(latest ? currentDeps.resolveDurationMs?.(latest) ?? 0 : 0);
        setStatus(latest ? RecorderStatus.Review : RecorderStatus.Idle);
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

  // Auto-pause when the app is backgrounded mid-recording, and undo
  // expo-audio's native auto-resume when we return to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState !== 'active') {
          if (status === RecorderStatus.Recording) {
            pauseInternal().catch(error =>
              log.error('Auto-pause on background failed', { error }),
            );
          }
          return;
        }

        // expo-audio's native module auto-resumes a recorder it paused on
        // background (OnActivityEntersForeground -> recorder.record()). Our
        // state machine owns pause/resume, so if we come back to the foreground
        // while still paused with a live session, undo that auto-resume and stay
        // paused until the user explicitly resumes. Reading `isRecording` before
        // pausing keeps this idempotent (a paused recorder reports false).
        if (
          status === RecorderStatus.Paused &&
          liveSessionTokenRef.current !== null &&
          recorder.isRecording
        ) {
          recorder.pause();
        }
      },
    );
    return () => subscription.remove();
    // pauseInternal is stable via closure and eslint-disable to avoid re-subscribing every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, recorder]);

  useEffect(() => () => clearTick(), [clearTick]);

  // Append the recorder's current output file to the segment list. Called after
  // starting/continuing a session; `includes` keeps it idempotent if the uri
  // was already registered (e.g. re-read after stop()).
  const registerCurrentSegment = useCallback(() => {
    const uri = recorder.uri;
    if (uri && !segmentsRef.current.includes(uri)) {
      segmentsRef.current = [...segmentsRef.current, uri];
    }
  }, [recorder]);

  const requestPermission =
    useCallback(async (): Promise<PermissionRequestResult> => {
      const response = await requestRecordingPermissionsAsync();
      setPermission(mapPermissionState(response));
      return {
        granted: response.granted,
        canAskAgain: response.canAskAgain ?? true,
      };
    }, []);

  // Fresh take: reset elapsed and the segment list, then open the first segment.
  const startRecordingSession = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    liveSessionTokenRef.current = createLiveSessionToken();
    segmentsRef.current = [];
    setCanResume(false);
    setIsRecovered(false);
    baseElapsedRef.current = 0;
    runningSinceRef.current = Date.now();
    startedAtRef.current = new Date().toISOString();
    setElapsedMs(0);
    recorder.record();
    registerCurrentSegment();
    // Persist immediately so a kill right after start is still recoverable.
    persistLiveMarker(0);
    setStatus(RecorderStatus.Recording);
    startTicking();
  }, [persistLiveMarker, recorder, registerCurrentSegment, startTicking]);

  // Resume a take rehydrated after a process kill: open a NEW segment appended
  // to the restored ones, preserving the accumulated elapsed time and started-at
  // so the take reads as one continuous recording.
  const continueRecordingSession = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    liveSessionTokenRef.current = createLiveSessionToken();
    runningSinceRef.current = Date.now();
    recorder.record();
    registerCurrentSegment();
    // Persist the appended segment immediately so a kill right after resuming
    // is still recoverable.
    persistLiveMarker(baseElapsedRef.current);
    setCanResume(false);
    setIsRecovered(false);
    setStatus(RecorderStatus.Recording);
    startTicking();
  }, [persistLiveMarker, recorder, registerCurrentSegment, startTicking]);

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
    if (status !== RecorderStatus.Recording) return;

    const segmentStart = runningSinceRef.current;
    const segmentElapsed =
      segmentStart === null ? 0 : Date.now() - segmentStart;
    const finalElapsed = baseElapsedRef.current + segmentElapsed;
    recorder.pause();
    clearTick();
    baseElapsedRef.current = finalElapsed;
    runningSinceRef.current = null;
    setElapsedMs(finalElapsed);
    setStatus(RecorderStatus.Paused);
    setCanResume(liveSessionTokenRef.current !== null);
    persistLiveMarker(finalElapsed);
  }, [clearTick, persistLiveMarker, recorder, status]);

  const pause = useCallback(async () => {
    await pauseInternal();
  }, [pauseInternal]);

  const resume = useCallback(async () => {
    if (status !== RecorderStatus.Paused) return;

    // Rehydrated take (no live native session): the previous recorder died with
    // the process, so open a new segment instead of resuming a native session.
    if (liveSessionTokenRef.current === null) {
      if (segmentsRef.current.length === 0) return;
      await continueRecordingSession();
      return;
    }

    // Live session: the native recorder still holds the current segment file.
    // Guard against it already running: if the app was backgrounded and
    // expo-audio auto-resumed it (and our foreground re-pause was missed due to
    // lifecycle ordering), calling record() again would start an already-started
    // recorder and throw. Only resume the native session when it is paused.
    if (!recorder.isRecording) {
      recorder.record();
    }
    runningSinceRef.current = Date.now();
    setStatus(RecorderStatus.Recording);
    setCanResume(false);
    startTicking();
  }, [continueRecordingSession, recorder, startTicking, status]);

  const commitRecording = useCallback(async () => {
    const currentSessionKey = sessionKeyRef.current;
    if (currentSessionKey === null) return;

    // Compute the final duration from refs before stopping so a late tick
    // or a stale `elapsedMs` render can't skew what lands in storage.
    const segmentStart = runningSinceRef.current;
    const activeSegmentMs =
      segmentStart === null ? 0 : Date.now() - segmentStart;
    const duration = baseElapsedRef.current + activeSegmentMs;

    // A take rehydrated after a process kill (Stop pressed straight from the
    // recovery prompt) has no live native recorder — its segments are already
    // finalized on disk. Only stop/finalize the recorder when a session is
    // actually live; otherwise committing the persisted segments is enough.
    const hasLiveSession = liveSessionTokenRef.current !== null;
    if (hasLiveSession) {
      try {
        await recorder.stop();
      } catch (error) {
        log.warn('Recorder stop failed while committing take', {
          sessionKey: currentSessionKey,
          error,
        });
        setStatus(
          currentRecording ? RecorderStatus.Review : RecorderStatus.Idle,
        );
        return;
      } finally {
        clearTick();
      }
      // Capture the just-finalized segment in case its uri wasn't ready when
      // the session opened, then commit the full ordered segment list.
      registerCurrentSegment();
    } else {
      clearTick();
    }

    const fileUris = segmentsRef.current;
    if (fileUris.length === 0) {
      log.error('Recorder produced no segments on stop; skipping commit');
      setStatus(currentRecording ? RecorderStatus.Review : RecorderStatus.Idle);
      return;
    }

    let committed: Recording | null;
    try {
      committed = await depsRef.current.onCommit({
        fileUris,
        durationMs: duration,
      });
    } catch (error) {
      log.error('Failed to commit recording', {
        sessionKey: currentSessionKey,
        error,
      });
      setStatus(currentRecording ? RecorderStatus.Review : RecorderStatus.Idle);
      return;
    }

    if (!committed) {
      setStatus(currentRecording ? RecorderStatus.Review : RecorderStatus.Idle);
      return;
    }

    depsRef.current.clearPaused();
    segmentsRef.current = [];
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
    startedAtRef.current = null;
    liveSessionTokenRef.current = null;
    setCanResume(false);
    setIsRecovered(false);
    setElapsedMs(depsRef.current.resolveDurationMs?.(committed) ?? duration);
    setCurrentRecording(committed);
    setStatus(RecorderStatus.Review);
  }, [clearTick, currentRecording, recorder, registerCurrentSegment]);

  const stop = useCallback(async () => {
    if (status !== RecorderStatus.Recording && status !== RecorderStatus.Paused)
      return;
    // A rehydrated paused take can be committed straight from the recovery
    // prompt as long as it still has segments on disk; only bail when there is
    // nothing to finalize.
    if (
      status === RecorderStatus.Paused &&
      liveSessionTokenRef.current === null &&
      segmentsRef.current.length === 0
    )
      return;
    await commitRecording();
  }, [commitRecording, status]);

  const reRecord = useCallback(async () => {
    if (status !== RecorderStatus.Review) return;
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
    if (status !== RecorderStatus.Review || !currentRecording) return;
    stopPlayback();
    const currentSessionKey = sessionKeyRef.current;
    try {
      await depsRef.current.deleteCommitted(currentRecording);
    } catch (error) {
      log.error('Failed to delete committed recording', {
        sessionKey: currentSessionKey,
        error,
      });
      return;
    }
    setCurrentRecording(null);
    setStatus(RecorderStatus.Idle);
    setElapsedMs(0);
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
  }, [currentRecording, status, stopPlayback]);

  const discardPaused = useCallback(async () => {
    const currentSessionKey = sessionKeyRef.current;
    if (currentSessionKey === null) return;
    // Read the marker before clearing so we can unlink every partial segment
    // (recorder.uri is unreliable after a process kill; the marker is not).
    const marker = depsRef.current.loadPaused();
    try {
      await recorder.stop();
    } catch (error) {
      log.warn('Recorder stop while discarding in-progress take failed', {
        error,
      });
    }
    registerCurrentSegment();
    const fileUris = marker?.segments ?? segmentsRef.current;
    if (fileUris.length > 0) depsRef.current.deletePausedFiles(fileUris);
    depsRef.current.clearPaused();
    clearTick();
    segmentsRef.current = [];
    baseElapsedRef.current = 0;
    runningSinceRef.current = null;
    startedAtRef.current = null;
    liveSessionTokenRef.current = null;
    setCanResume(false);
    setIsRecovered(false);
    setElapsedMs(0);
    setStatus(currentRecording ? RecorderStatus.Review : RecorderStatus.Idle);
  }, [clearTick, currentRecording, recorder, registerCurrentSegment]);

  const togglePlayback = useCallback(async () => {
    if (status !== RecorderStatus.Review || !currentRecording) return;
    await togglePlaybackInternal();
  }, [currentRecording, status, togglePlaybackInternal]);

  return {
    status,
    elapsedMs,
    permission,
    currentRecording,
    isReady,
    canResume,
    isRecovered,
    playback: {
      isPlaying,
      toggle: togglePlayback,
      stop: stopPlayback,
    },
    requestPermission,
    start,
    pause,
    resume,
    stop,
    reRecord,
    deleteCurrent,
    discardPaused,
  };
}
