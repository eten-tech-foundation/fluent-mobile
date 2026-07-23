import { createPlaybackEngine } from './createPlaybackEngine';
import type { EnginePlayer } from './createPlaybackEngine';

function makeFakePlayer(options?: {
  /** Polls of `isLoaded` that return false after replace. */
  unloadPolls?: number;
  /** Duration in seconds once loaded. */
  durationSec?: number;
}): EnginePlayer & {
  calls: string[];
} {
  const unloadPolls = options?.unloadPolls ?? 0;
  const durationSec = options?.durationSec ?? 2.5;
  const state = {
    uri: null as string | null,
    time: 0,
    duration: 0,
    playing: false,
    remainingUnloadPolls: 0,
    calls: [] as string[],
  };

  const player: EnginePlayer & { calls: string[] } = {
    get calls() {
      return state.calls;
    },
    get playing() {
      return state.playing;
    },
    get currentTime() {
      return state.time;
    },
    get duration() {
      return state.duration;
    },
    get isLoaded() {
      if (!state.uri) return false;
      if (state.remainingUnloadPolls > 0) {
        state.remainingUnloadPolls -= 1;
        if (state.remainingUnloadPolls === 0) {
          state.duration = durationSec;
        }
        return false;
      }
      return true;
    },
    replace(source: string | { uri: string } | null) {
      state.calls.push('replace');
      const uri =
        typeof source === 'string'
          ? source
          : source && typeof source === 'object'
          ? source.uri
          : null;
      state.uri = uri;
      state.time = 0;
      state.playing = false;
      if (!uri) {
        state.duration = 0;
        state.remainingUnloadPolls = 0;
        return;
      }
      state.remainingUnloadPolls = unloadPolls;
      state.duration = unloadPolls === 0 ? durationSec : 0;
    },
    play() {
      state.calls.push('play');
      state.playing = true;
    },
    pause() {
      state.calls.push('pause');
      state.playing = false;
    },
    async seekTo(seconds: number) {
      state.calls.push(`seek:${seconds}`);
      state.time = seconds;
    },
    remove() {
      state.calls.push('remove');
      state.uri = null;
      state.playing = false;
    },
  };

  return player;
}

describe('createPlaybackEngine', () => {
  it('play → pause → seek → stop', async () => {
    const player = makeFakePlayer();
    const statuses: string[] = [];
    const engine = createPlaybackEngine({
      player,
      onStatusChange: s => statuses.push(s),
      delayMs: async () => undefined,
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
    // stop must keep the player alive for later play()/delete→re-record cycles
    expect(player.calls).not.toContain('remove');
  });

  it('waits for isLoaded before play and emits non-zero duration', async () => {
    const player = makeFakePlayer({ unloadPolls: 3, durationSec: 4 });
    const positions: Array<[number, number]> = [];
    const engine = createPlaybackEngine({
      player,
      delayMs: async () => undefined,
      onPositionChange: (pos, dur) => positions.push([pos, dur]),
    });

    await engine.play('file:///take.m4a');
    expect(engine.getStatus()).toBe('playing');
    expect(engine.durationMs).toBe(4000);
    expect(player.calls.filter(c => c === 'play')).toHaveLength(1);
    expect(positions.some(([, dur]) => dur === 4000)).toBe(true);
  });

  it('rejects when play does not start and duration stays 0', async () => {
    const player = makeFakePlayer({ durationSec: 0 });
    // play() is a no-op for "corrupt" — stays not playing with 0 duration.
    player.play = () => {
      player.calls.push('play');
    };
    const engine = createPlaybackEngine({
      player,
      delayMs: async () => undefined,
    });

    await expect(engine.play('file:///empty.m4a')).rejects.toThrow(
      /duration 0:00/,
    );
    expect(engine.getStatus()).toBe('idle');
  });

  it('allows play when duration is 0 but player starts (ADTS-style)', async () => {
    const player = makeFakePlayer({ durationSec: 0 });
    const engine = createPlaybackEngine({
      player,
      delayMs: async () => undefined,
    });

    await engine.play('file:///adts.aac');
    expect(engine.getStatus()).toBe('playing');
    expect(player.calls).toContain('play');
  });

  it('rejects when load never completes', async () => {
    const player = makeFakePlayer();
    Object.defineProperty(player, 'isLoaded', {
      get: () => false,
      configurable: true,
    });
    const engine = createPlaybackEngine({
      player,
      delayMs: async () => undefined,
      loadTimeoutMs: 5,
    });

    await expect(engine.play('file:///missing.m4a')).rejects.toThrow(
      /failed to load/,
    );
    expect(player.calls).not.toContain('play');
  });

  it('stop then play reuses the same player', async () => {
    const player = makeFakePlayer();
    const engine = createPlaybackEngine({
      player,
      delayMs: async () => undefined,
    });
    await engine.play('file:///take.m4a');
    await engine.stop();
    await engine.play('file:///take2.m4a');
    expect(engine.getStatus()).toBe('playing');
    expect(player.calls.filter(c => c === 'remove')).toHaveLength(0);
  });

  it('calls prepareAudioMode once', async () => {
    const player = makeFakePlayer();
    const prepareAudioMode = jest.fn(async () => undefined);
    const engine = createPlaybackEngine({
      player,
      prepareAudioMode,
      delayMs: async () => undefined,
    });
    await engine.play('file:///a.m4a');
    await engine.pause();
    await engine.play('file:///b.m4a');
    expect(prepareAudioMode).toHaveBeenCalledTimes(1);
  });
});
