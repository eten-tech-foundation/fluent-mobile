import { createPlaybackEngine } from './createPlaybackEngine';
import type { EnginePlayer } from './createPlaybackEngine';

function makeFakePlayer(): EnginePlayer & {
  _uri: string | null;
  _time: number;
  _duration: number;
  _playing: boolean;
  calls: string[];
} {
  const state = {
    _uri: null as string | null,
    _time: 0,
    _duration: 0,
    _playing: false,
    calls: [] as string[],
  };

  return {
    get calls() {
      return state.calls;
    },
    get _uri() {
      return state._uri;
    },
    get _time() {
      return state._time;
    },
    get _duration() {
      return state._duration;
    },
    get _playing() {
      return state._playing;
    },
    get playing() {
      return state._playing;
    },
    get currentTime() {
      return state._time;
    },
    get duration() {
      return state._duration;
    },
    get isLoaded() {
      return Boolean(state._uri);
    },
    replace(source: string | { uri: string } | null) {
      state.calls.push('replace');
      const uri =
        typeof source === 'string'
          ? source
          : source && typeof source === 'object'
          ? source.uri
          : null;
      state._uri = uri;
      state._duration = uri ? 2.5 : 0;
      state._time = 0;
      state._playing = false;
    },
    play() {
      state.calls.push('play');
      state._playing = true;
    },
    pause() {
      state.calls.push('pause');
      state._playing = false;
    },
    async seekTo(seconds: number) {
      state.calls.push(`seek:${seconds}`);
      state._time = seconds;
    },
    remove() {
      state.calls.push('remove');
      state._uri = null;
      state._playing = false;
    },
  };
}

describe('createPlaybackEngine', () => {
  it('play → pause → seek → stop', async () => {
    const player = makeFakePlayer();
    const statuses: string[] = [];
    const engine = createPlaybackEngine({
      player,
      onStatusChange: s => statuses.push(s),
    });

    await engine.play('file:///take.m4a');
    expect(engine.getStatus()).toBe('playing');
    expect(engine.durationMs).toBe(2500);

    await engine.pause();
    expect(engine.getStatus()).toBe('paused');

    await engine.seek(1000);
    expect(engine.positionMs).toBe(1000);

    await engine.stop();
    expect(engine.getStatus()).toBe('idle');
    expect(statuses).toEqual(['playing', 'paused', 'idle']);
    expect(player.calls).toContain('replace');
    expect(player.calls).toContain('play');
    expect(player.calls).toContain('pause');
    expect(player.calls.some(c => c.startsWith('seek:'))).toBe(true);
  });

  it('calls prepareAudioMode once', async () => {
    const player = makeFakePlayer();
    const prepareAudioMode = jest.fn(async () => undefined);
    const engine = createPlaybackEngine({ player, prepareAudioMode });
    await engine.play('file:///a.m4a');
    await engine.pause();
    await engine.play('file:///b.m4a');
    expect(prepareAudioMode).toHaveBeenCalledTimes(1);
  });
});
