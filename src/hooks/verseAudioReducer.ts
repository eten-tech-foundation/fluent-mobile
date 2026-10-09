export type VerseAudioState =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'recorded'
  | 'playing'
  | 'saving'
  | 'error';

export type VerseAudioEvent =
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'SAVED' }
  | { type: 'SAVE_FAILED' }
  | { type: 'DISCARD' }
  | { type: 'PLAY' }
  | { type: 'PLAYBACK_END' }
  | { type: 'DELETE' }
  | { type: 'RECOVER' }
  | { type: 'REHYDRATE'; hasTake: boolean }
  | { type: 'ERROR'; message: string };

/**
 * Pure verse-audio state machine (#97). Side effects live in the hook.
 */
export function verseAudioReducer(
  state: VerseAudioState,
  event: VerseAudioEvent,
): VerseAudioState {
  switch (event.type) {
    case 'REHYDRATE':
      if (state === 'recording' || state === 'paused' || state === 'saving') {
        return state;
      }
      return event.hasTake ? 'recorded' : 'idle';
    case 'START':
      if (
        state === 'idle' ||
        state === 'recorded' ||
        state === 'playing' ||
        state === 'error'
      ) {
        return 'recording';
      }
      return state;
    case 'PAUSE':
      return state === 'recording' ? 'paused' : state;
    case 'RESUME':
      return state === 'paused' ? 'recording' : state;
    case 'STOP':
      if (state === 'recording' || state === 'paused') {
        return 'saving';
      }
      return state;
    case 'SAVED':
      return state === 'saving' ? 'recorded' : state;
    case 'SAVE_FAILED':
      // Persist failed after STOP: segments are kept on disk and in the hook's
      // refs, so return to paused and let the user retry Stop, Resume, or
      // Discard instead of dropping to error/idle (#567).
      return state === 'saving' ? 'paused' : state;
    case 'DISCARD':
      // Abandoned capture (#49): drop the in-progress take without persisting.
      // Prior review state (takes list) is restored by REHYDRATE in the hook.
      if (state === 'recording' || state === 'paused') {
        return 'idle';
      }
      return state;
    case 'PLAY':
      return state === 'recorded' ? 'playing' : state;
    case 'PLAYBACK_END':
      return state === 'playing' ? 'recorded' : state;
    case 'DELETE':
      if (
        state === 'recorded' ||
        state === 'playing' ||
        state === 'paused' ||
        state === 'error'
      ) {
        return 'idle';
      }
      return state;
    case 'RECOVER':
      if (state === 'idle' || state === 'recorded' || state === 'error') {
        return 'paused';
      }
      return state;
    case 'ERROR':
      return 'error';
    default:
      return state;
  }
}
