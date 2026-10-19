import {
  applyNativePlaybackStatus,
  didJustFinishEdge,
  shouldEndPlaybackOnIdle,
  type PlaybackMirror,
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

describe('applyNativePlaybackStatus', () => {
  const idle: PlaybackMirror = {
    positionMs: 0,
    durationMs: 0,
    status: 'idle',
    didJustFinish: false,
  };

  it('keeps a stable mirror across a long run of playing ticks (#569)', () => {
    let mirror: PlaybackMirror = {
      ...idle,
      status: 'playing',
      durationMs: 8000,
    };
    const pauses: boolean[] = [];
    for (let i = 1; i <= 60; i += 1) {
      const next = applyNativePlaybackStatus(mirror, {
        currentTime: i / 10,
        duration: 8,
        playing: true,
        didJustFinish: false,
      });
      pauses.push(next.pausePlayer);
      mirror = next;
    }
    expect(pauses.every(pause => pause === false)).toBe(true);
    expect(mirror.status).toBe('playing');
    expect(mirror.positionMs).toBe(6000);
    expect(mirror.durationMs).toBe(8000);
  });

  it('pauses once when didJustFinish rises, then ignores the sticky flag (#176)', () => {
    const first = applyNativePlaybackStatus(
      { ...idle, status: 'playing', durationMs: 4000, positionMs: 4000 },
      { currentTime: 4, duration: 4, playing: false, didJustFinish: true },
    );
    expect(first.pausePlayer).toBe(true);
    expect(first.status).toBe('idle');

    const sticky = applyNativePlaybackStatus(first, {
      currentTime: 4,
      duration: 4,
      playing: false,
      didJustFinish: true,
    });
    expect(sticky.pausePlayer).toBe(false);
    expect(sticky.status).toBe('idle');
  });

  it('does not let a late playing tick override an explicit pause', () => {
    const next = applyNativePlaybackStatus(
      { ...idle, status: 'paused', positionMs: 1200, durationMs: 8000 },
      { currentTime: 1.3, duration: 8, playing: true },
    );
    expect(next.status).toBe('paused');
    expect(next.positionMs).toBe(1300);
    expect(next.pausePlayer).toBe(false);
  });

  it('does not treat a not-playing sample as pause', () => {
    const next = applyNativePlaybackStatus(
      { ...idle, status: 'playing', durationMs: 8000 },
      { currentTime: 0, duration: 0, playing: false },
    );
    expect(next.status).toBe('playing');
    expect(next.durationMs).toBe(8000);
  });
});
