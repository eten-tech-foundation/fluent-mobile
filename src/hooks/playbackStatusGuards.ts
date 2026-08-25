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
