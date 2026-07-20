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
};

export type PlaybackEngine = PlayerApi & {
  getStatus(): PlayerStatus;
};

/**
 * UI-agnostic playback engine around an expo-audio player instance.
 * Waveform visualization is separate (`PlaybackProgressBar`).
 */
export function createPlaybackEngine(deps: PlaybackEngineDeps): PlaybackEngine {
  const { player, onStatusChange, onPositionChange, prepareAudioMode } = deps;
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
      player.replace({ uri });
      player.play();
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
      player.pause();
      await player.seekTo(0);
      player.remove?.();
      setStatus('idle');
      emitPosition();
    },
  };
}
