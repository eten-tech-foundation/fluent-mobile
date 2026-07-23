import type { RecorderApi, RecorderStatus, StopResult } from './types';

/** Minimal recorder surface matching expo-audio's AudioRecorder methods we use. */
export type EngineRecorder = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches expo-audio RecordingOptions
  prepareToRecordAsync: (options?: any) => Promise<void>;
  record: () => void;
  pause: () => void;
  stop: () => Promise<void>;
  readonly uri: string | null;
  /** Length of the recording in seconds (expo-audio). */
  readonly currentTime: number;
};

export type RecordingEngineDeps = {
  recorder: EngineRecorder;
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

export type RecordingEngine = RecorderApi & {
  getStatus(): RecorderStatus;
};

/**
 * UI/storage-agnostic recording engine around an expo-audio recorder instance.
 * Persistence and Alerts belong in #97 / screens — not here.
 */
export function createRecordingEngine(
  deps: RecordingEngineDeps,
): RecordingEngine {
  const { recorder, prepareAudioMode, releaseAudioMode, onStatusChange } = deps;
  let status: RecorderStatus = 'idle';
  let prepared = false;

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
      setStatus('recording');
    },
    async pause() {
      if (status !== 'recording') {
        return;
      }
      recorder.pause();
      setStatus('paused');
    },
    async resume() {
      if (status !== 'paused') {
        return;
      }
      recorder.record();
      setStatus('recording');
    },
    async stop(): Promise<StopResult> {
      if (status !== 'recording' && status !== 'paused') {
        throw new Error('Cannot stop recorder while idle');
      }
      let uri: string | null = null;
      let durationMs = 0;
      try {
        await recorder.stop();
        durationMs = Math.max(0, Math.round(recorder.currentTime * 1000));
        uri = recorder.uri;
      } finally {
        // Native MediaRecorder is released inside expo-audio stop; clear our
        // prepared flag and drop allowsRecording so the OS mic session ends.
        prepared = false;
        setStatus('idle');
        await releaseMode();
      }
      if (!uri) {
        throw new Error('Recording stopped without a file URI');
      }
      return { uri, durationMs };
    },
  };
}
