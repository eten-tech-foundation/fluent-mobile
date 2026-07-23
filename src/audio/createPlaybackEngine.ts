import type { PlayerApi, PlayerStatus } from './playbackTypes';

/** Minimal player surface matching expo-audio AudioPlayer methods we use. */
export type EnginePlayer = {
  replace: (source: string | { uri: string } | null) => void;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  remove?: () => void;
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly isLoaded: boolean;
};

export type PlaybackEngineDeps = {
  player: EnginePlayer;
  onStatusChange?: (status: PlayerStatus) => void;
  onPositionChange?: (positionMs: number, durationMs: number) => void;
  /** Optional audio-mode setup before first play. */
  prepareAudioMode?: () => Promise<void>;
  /** Injectable delay for tests (load polling). */
  delayMs?: (ms: number) => Promise<void>;
  /** Max wait for `isLoaded` after `replace`. */
  loadTimeoutMs?: number;
};

export type PlaybackEngine = PlayerApi & {
  getStatus(): PlayerStatus;
};

const DEFAULT_LOAD_TIMEOUT_MS = 8000;

function defaultDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * UI-agnostic playback engine around an expo-audio player instance.
 * Waveform visualization is separate (`PlaybackProgressBar`).
 */
export function createPlaybackEngine(deps: PlaybackEngineDeps): PlaybackEngine {
  const {
    player,
    onStatusChange,
    onPositionChange,
    prepareAudioMode,
    delayMs = defaultDelay,
    loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  } = deps;
  let status: PlayerStatus = 'idle';
  let modeReady = false;

  function setStatus(next: PlayerStatus): void {
    status = next;
    onStatusChange?.(next);
  }

  function emitPosition(): void {
    onPositionChange?.(
      Math.max(0, Math.round(player.currentTime * 1000)),
      Math.max(0, Math.round(player.duration * 1000)),
    );
  }

  async function ensureMode(): Promise<void> {
    if (modeReady || !prepareAudioMode) {
      return;
    }
    await prepareAudioMode();
    modeReady = true;
  }

  /**
   * `replace` prepares asynchronously on the native queue. Calling `play`
   * before `isLoaded` leaves duration/position at 0 and looks like a stuck
   * 0:00 take. Poll until ready (or fail visibly).
   */
  async function waitUntilLoaded(): Promise<void> {
    const deadline = Date.now() + loadTimeoutMs;
    while (!player.isLoaded) {
      if (Date.now() >= deadline) {
        throw new Error(
          'Take failed to load for playback. The file may be missing or corrupt.',
        );
      }
      await delayMs(50);
    }
  }

  return {
    get status() {
      return status;
    },
    get positionMs() {
      return Math.max(0, Math.round(player.currentTime * 1000));
    },
    get durationMs() {
      return Math.max(0, Math.round(player.duration * 1000));
    },
    getStatus() {
      return status;
    },
    async play(uri: string) {
      await ensureMode();
      // Leave prior status until load succeeds so UI does not show "playing" at 0:00.
      player.replace({ uri });
      await waitUntilLoaded();
      player.play();
      // Some containers (e.g. raw ADTS) report duration 0 until playback starts.
      await delayMs(100);
      const durationMs = Math.max(0, Math.round(player.duration * 1000));
      if (!player.playing && durationMs <= 0) {
        throw new Error(
          'Take has no playable audio (duration 0:00). Re-record this verse.',
        );
      }
      setStatus('playing');
      emitPosition();
    },
    async pause() {
      if (status !== 'playing') {
        return;
      }
      player.pause();
      setStatus('paused');
      emitPosition();
    },
    async seek(ms: number) {
      const seconds = Math.max(0, ms) / 1000;
      await player.seekTo(seconds);
      emitPosition();
    },
    async stop() {
      // Do not call player.remove() here — usePlaybackEngine owns a singleton
      // player for the Record tab lifetime. remove() is only for unmount cleanup.
      player.pause();
      await player.seekTo(0);
      setStatus('idle');
      emitPosition();
    },
  };
}
