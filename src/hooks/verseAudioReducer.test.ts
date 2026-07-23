import {
  verseAudioReducer,
  type VerseAudioEvent,
  type VerseAudioState,
} from './verseAudioReducer';

describe('verseAudioReducer', () => {
  const step = (from: VerseAudioState, event: VerseAudioEvent) =>
    verseAudioReducer(from, event);

  it('idle → recording → paused → recording → saving → recorded', () => {
    let s: VerseAudioState = 'idle';
    s = step(s, { type: 'START' });
    expect(s).toBe('recording');
    s = step(s, { type: 'PAUSE' });
    expect(s).toBe('paused');
    s = step(s, { type: 'RESUME' });
    expect(s).toBe('recording');
    s = step(s, { type: 'STOP' });
    expect(s).toBe('saving');
    s = step(s, { type: 'SAVED' });
    expect(s).toBe('recorded');
  });

  it('REHYDRATE derives recorded vs idle from DB', () => {
    expect(step('idle', { type: 'REHYDRATE', hasTake: true })).toBe('recorded');
    expect(step('recorded', { type: 'REHYDRATE', hasTake: false })).toBe(
      'idle',
    );
    expect(step('recording', { type: 'REHYDRATE', hasTake: true })).toBe(
      'recording',
    );
  });

  it('recorded → playing → recorded on PLAYBACK_END', () => {
    expect(step('recorded', { type: 'PLAY' })).toBe('playing');
    expect(step('playing', { type: 'PLAYBACK_END' })).toBe('recorded');
  });

  it('DELETE returns to idle from recorded/playing/error', () => {
    expect(step('recorded', { type: 'DELETE' })).toBe('idle');
    expect(step('playing', { type: 'DELETE' })).toBe('idle');
    expect(step('error', { type: 'DELETE' })).toBe('idle');
  });

  it('ERROR always transitions to error', () => {
    expect(step('recording', { type: 'ERROR', message: 'x' })).toBe('error');
    expect(step('idle', { type: 'ERROR', message: 'x' })).toBe('error');
  });

  it('ignores illegal transitions', () => {
    expect(step('idle', { type: 'PAUSE' })).toBe('idle');
    expect(step('idle', { type: 'STOP' })).toBe('idle');
    expect(step('recording', { type: 'PLAY' })).toBe('recording');
  });

  it('START from recorded begins a re-record', () => {
    expect(step('recorded', { type: 'START' })).toBe('recording');
  });
});
