import {
  didJustFinishEdge,
  shouldEndPlaybackOnIdle,
} from './playbackStatusGuards';

describe('didJustFinishEdge', () => {
  it('fires once when didJustFinish becomes true', () => {
    expect(didJustFinishEdge(false, true)).toBe(true);
  });

  it('does not re-fire while didJustFinish stays sticky true', () => {
    // Android leaves the last useEvent payload with didJustFinish until the
    // next emit; level-triggering idle here raced Take 2 play (#298).
    expect(didJustFinishEdge(true, true)).toBe(false);
  });

  it('resets when cleared so a later finish can fire again', () => {
    expect(didJustFinishEdge(true, false)).toBe(false);
    expect(didJustFinishEdge(false, true)).toBe(true);
  });
});

describe('shouldEndPlaybackOnIdle', () => {
  it('ends when playing meets idle and no load is in flight', () => {
    expect(shouldEndPlaybackOnIdle('playing', 'idle', false)).toBe(true);
  });

  it('skips idle during in-flight play/load replace (Take 1 → Take 2)', () => {
    expect(shouldEndPlaybackOnIdle('playing', 'idle', true)).toBe(false);
  });

  it('does not end from recorded/idle or playing/playing', () => {
    expect(shouldEndPlaybackOnIdle('recorded', 'idle', false)).toBe(false);
    expect(shouldEndPlaybackOnIdle('playing', 'playing', false)).toBe(false);
  });
});
