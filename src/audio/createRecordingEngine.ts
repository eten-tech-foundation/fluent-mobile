import { logger } from '../utils/logger';
import type {
  PauseResult,
  RecorderApi,
  RecorderStatus,
  StopResult,
} from './types';

const log = logger.create('recordingEngine');

/** Minimal recorder surface matching expo-audio's AudioRecorder methods we use. */
export type EngineRecorder = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches expo-audio RecordingOptions
  prepareToRecordAsync: (options?: any) => Promise<void>;
  record: () => void;
  pause: () => void;
  stop: () => Promise<void>;
  readonly isRecording: boolean;
  readonly uri: string | null;
  /** Length of the recording in seconds (expo-audio). */
  readonly currentTime: number;
};

/**
 * A recorder asked to pause or stop right after it started may not have a
 * file yet: native stop then throws or yields no URI and the take is lost
 * (#979). Pause and stop wait until the recorder has run this long.
 */
export const MIN_RECORDING_MS = 500;

export type RecordingEngineDeps = {
  recorder: EngineRecorder;
  /** How long the recorder must have run before pause/stop; tests set 0. */
  minRecordingMs?: number;
  /** Optional audio-mode setup before first start (injectable for tests). */
  prepareAudioMode?: () => Promise<void>;
  /**
   * Drop recording capability after stop/cleanup so Android / the audio
   * session no longer treat the app as actively recording.
   */
  releaseAudioMode?: () => Promise<void>;
  /** Override status notifications (React setState, etc.). */
  onStatusChange?: (status: RecorderStatus) => void;
};

export type RecordingEngine = Omit<RecorderApi, 'stop'> & {
  /**
   * `immediate` skips the hold for teardown, where the recorder is about to
   * be released and a take nobody asked to keep needs no file (#979).
   */
  stop(options?: { immediate?: boolean }): Promise<StopResult | null>;
  getStatus(): RecorderStatus;
  syncPausedNativeState(): void;
};

/**
 * UI/storage-agnostic recording engine around an expo-audio recorder instance.
 * Persistence and Alerts belong in #97 / screens — not here.
 */
export function createRecordingEngine(
  deps: RecordingEngineDeps,
): RecordingEngine {
  const { recorder, prepareAudioMode, releaseAudioMode, onStatusChange } = deps;
  const minRecordingMs = deps.minRecordingMs ?? MIN_RECORDING_MS;
  let status: RecorderStatus = 'idle';
  let prepared = false;
  // When native record() was called for the current take; null while idle.
  let startedAt: number | null = null;
  // One hold shared by every pause/stop waiting on the same start, so a
  // teardown stop can release it early.
  let hold: { promise: Promise<void>; release: () => void } | null = null;
  // The stop in flight (holding or in the native call); later stops join it.
  let stopping: Promise<StopResult | null> | null = null;

  function setStatus(next: RecorderStatus): void {
    status = next;
    onStatusChange?.(next);
  }

  async function ensurePrepared(): Promise<void> {
    if (prepared) {
      return;
    }
    if (prepareAudioMode) {
      await prepareAudioMode();
    }
    await recorder.prepareToRecordAsync();
    prepared = true;
  }

  /**
   * Holds a pause/stop that comes right after start until the recorder has
   * run long enough to have a file. Waits before the native call: after a
   * failed native stop the recorder is already released and cannot retry.
   */
  function holdForMinimum(): Promise<void> {
    if (startedAt === null) {
      return Promise.resolve();
    }
    const wait = startedAt + minRecordingMs - Date.now();
    if (wait <= 0) {
      return Promise.resolve();
    }
    if (!hold) {
      let release!: () => void;
      const promise = new Promise<void>(resolve => {
        const timer = setTimeout(() => release(), wait);
        release = () => {
          clearTimeout(timer);
          hold = null;
          resolve();
        };
      });
      hold = { promise, release };
    }
    return hold.promise;
  }

  async function releaseMode(): Promise<void> {
    if (!releaseAudioMode) {
      return;
    }
    try {
      await releaseAudioMode();
    } catch {
      // Best-effort — never block stop/cleanup on mode reset failure.
    }
  }

  async function runStop(immediate: boolean): Promise<StopResult | null> {
    if (!immediate) {
      await holdForMinimum();
    }
    // A pause may have landed while this stop waited; stop works from either.
    const durationMs = Math.max(0, Math.round(recorder.currentTime * 1000));

    let uri: string | null = null;

    try {
      await recorder.stop();
      uri = recorder.uri;
    } finally {
      prepared = false;
      startedAt = null;
      setStatus('idle');
      await releaseMode();
    }
    if (!uri) {
      // Nothing was written, so there is no take to keep. Not an error: the
      // caller drops the take quietly (#979).
      log.warn('Recording stopped without a file URI');
      return null;
    }
    return { uri, durationMs };
  }

  return {
    get status() {
      return status;
    },
    getStatus() {
      return status;
    },
    async start() {
      if (status === 'recording') {
        return;
      }
      await ensurePrepared();
      recorder.record();
      startedAt = Date.now();
      setStatus('recording');
    },
    async pause(): Promise<PauseResult | null> {
      if (status !== 'recording' || stopping) {
        return null;
      }
      await holdForMinimum();
      // A stop (or another pause) may have landed while this one waited.
      if (status !== 'recording' || stopping) {
        return null;
      }
      recorder.pause();
      setStatus('paused');
      if (!recorder.uri) {
        // Pause must still succeed so the mic session is not bricked; without a
        // URI there is simply nothing to mark for kill-safe recovery (#567).
        log.warn('Recording paused without a file URI');
        return null;
      }
      return {
        uri: recorder.uri,
        durationMs: Math.max(0, Math.round(recorder.currentTime * 1000)),
      };
    },
    async resume() {
      if (status !== 'paused') {
        return;
      }
      if (!recorder.isRecording) {
        if (prepareAudioMode) {
          await prepareAudioMode();
        }
        if (status !== 'paused') {
          return;
        }
        if (!recorder.isRecording) {
          recorder.record();
        }
      }
      setStatus('recording');
    },
    syncPausedNativeState() {
      if (status === 'paused' && recorder.isRecording) {
        recorder.pause();
      }
    },
    stop(options): Promise<StopResult | null> {
      if (stopping) {
        // Double tap, or teardown while a stop is holding: share the one stop.
        if (options?.immediate) {
          hold?.release();
        }
        return stopping;
      }
      if (status !== 'recording' && status !== 'paused') {
        return Promise.reject(new Error('Cannot stop recorder while idle'));
      }
      stopping = runStop(options?.immediate === true).finally(() => {
        stopping = null;
      });
      return stopping;
    },
  };
}
