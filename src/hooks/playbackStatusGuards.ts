import type { PlayerStatus } from '../audio/playbackTypes';
import type { VerseAudioState } from './verseAudioReducer';

/**
 * Pure gates for Review playback status transitions (#298).
 * Kept free of React so take-switch races are unit-testable.
 */

/** True only on the rising edge of `didJustFinish` (sticky true must not re-fire). */
export function didJustFinishEdge(prev: boolean, next: boolean): boolean {
  return next && !prev;
}

export type NativePlaybackSample = {
  currentTime: number;
  duration: number;
  playing: boolean;
  didJustFinish?: boolean;
};

export type PlaybackMirror = {
  positionMs: number;
  durationMs: number;
  status: PlayerStatus;
  didJustFinish: boolean;
};

export type PlaybackMirrorUpdate = PlaybackMirror & {
  /** Pause once on a finish edge so a later scrub cannot restart audio (#176). */
  pausePlayer: boolean;
};

/**
 * Fold one expo-audio status sample into the mirror React actually renders.
 * Repeated samples with the same rounded time must not request another player
 * call — `useEvent` used to setState on every object and the follow-up effect
 * crossed React's passive update limit (#569).
 */
export function applyNativePlaybackStatus(
  prev: PlaybackMirror,
  sample: NativePlaybackSample,
): PlaybackMirrorUpdate {
  const positionMs = Math.max(0, Math.round(sample.currentTime * 1000));
  const roundedDuration = Math.max(0, Math.round(sample.duration * 1000));
  const durationMs = roundedDuration > 0 ? roundedDuration : prev.durationMs;
  const didJustFinish = Boolean(sample.didJustFinish);
  const pausePlayer = didJustFinishEdge(prev.didJustFinish, didJustFinish);
  if (pausePlayer) {
    return {
      positionMs,
      durationMs,
      status: 'idle',
      didJustFinish,
      pausePlayer: true,
    };
  }
  const status: PlayerStatus =
    sample.playing && prev.status !== 'paused' ? 'playing' : prev.status;
  return {
    positionMs,
    durationMs,
    status,
    didJustFinish,
    pausePlayer: false,
  };
}

/**
 * Natural end when the engine reports idle while the verse machine is playing.
 * Skip while a play/load `replace` is in flight — that gap is not end-of-take.
 */
export function shouldEndPlaybackOnIdle(
  verseState: VerseAudioState,
  playbackStatus: PlayerStatus,
  loadInFlight: boolean,
): boolean {
  if (loadInFlight) {
    return false;
  }
  return verseState === 'playing' && playbackStatus === 'idle';
}
