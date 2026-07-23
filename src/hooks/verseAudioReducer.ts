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
  | { type: 'PLAY' }
  | { type: 'PLAYBACK_END' }
  | { type: 'DELETE' }
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
    case 'ERROR':
      return 'error';
    default:
      return state;
  }
}
