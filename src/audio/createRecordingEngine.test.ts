import { createRecordingEngine } from './createRecordingEngine';
import type { EngineRecorder } from './createRecordingEngine';

function makeFakeRecorder(): EngineRecorder & {
  _uri: string | null;
  _time: number;
  calls: string[];
} {
  const state = {
    _uri: null as string | null,
    _time: 0,
    calls: [] as string[],
  };

  const fake: EngineRecorder & {
    _uri: string | null;
    _time: number;
    calls: string[];
  } = {
    get _uri() {
      return state._uri;
    },
    set _uri(v: string | null) {
      state._uri = v;
    },
    get _time() {
      return state._time;
    },
    set _time(v: number) {
      state._time = v;
    },
    get calls() {
      return state.calls;
    },
    get uri(): string | null {
      return state._uri;
    },
    get currentTime(): number {
      return state._time;
    },
    async prepareToRecordAsync() {
      state.calls.push('prepare');
    },
    record() {
      state.calls.push('record');
    },
    pause() {
      state.calls.push('pause');
    },
    async stop() {
      state.calls.push('stop');
      state._uri = 'file:///mock-recording.m4a';
      state._time = 1.25;
    },
  };
  return fake;
}

describe('createRecordingEngine', () => {
  it('transitions idle → recording → paused → recording → idle on stop', async () => {
    const recorder = makeFakeRecorder();
    const statuses: string[] = [];
    const engine = createRecordingEngine({
      recorder,
      onStatusChange: s => statuses.push(s),
    });

    expect(engine.getStatus()).toBe('idle');

    await engine.start();
    expect(engine.getStatus()).toBe('recording');
    expect(recorder.calls).toEqual(['prepare', 'record']);

    await engine.pause();
    expect(engine.getStatus()).toBe('paused');

    await engine.resume();
    expect(engine.getStatus()).toBe('recording');

    const result = await engine.stop();
    expect(engine.getStatus()).toBe('idle');
    expect(result).toEqual({
      uri: 'file:///mock-recording.m4a',
      durationMs: 1250,
    });
    expect(statuses).toEqual(['recording', 'paused', 'recording', 'idle']);
  });

  it('calls prepareAudioMode once before first start', async () => {
    const recorder = makeFakeRecorder();
    const prepareAudioMode = jest.fn(async () => undefined);
    const engine = createRecordingEngine({ recorder, prepareAudioMode });

    await engine.start();
    await engine.pause();
    await engine.resume();
    expect(prepareAudioMode).toHaveBeenCalledTimes(1);
  });

  it('throws when stop is called while idle', async () => {
    const engine = createRecordingEngine({ recorder: makeFakeRecorder() });
    await expect(engine.stop()).rejects.toThrow(/idle/i);
  });

  it('calls releaseAudioMode after stop so the session drops recording', async () => {
    const recorder = makeFakeRecorder();
    const releaseAudioMode = jest.fn(async () => undefined);
    const engine = createRecordingEngine({
      recorder,
      prepareAudioMode: async () => undefined,
      releaseAudioMode,
    });

    await engine.start();
    await engine.stop();
    expect(releaseAudioMode).toHaveBeenCalledTimes(1);
    expect(engine.getStatus()).toBe('idle');
  });

  it('still releases audio mode when stop yields no uri', async () => {
    const recorder = makeFakeRecorder();
    const releaseAudioMode = jest.fn(async () => undefined);
    recorder.stop = async () => {
      recorder.calls.push('stop');
      recorder._uri = null;
      recorder._time = 0;
    };
    const engine = createRecordingEngine({ recorder, releaseAudioMode });
    await engine.start();
    await expect(engine.stop()).rejects.toThrow(/URI/i);
    expect(releaseAudioMode).toHaveBeenCalledTimes(1);
    expect(engine.getStatus()).toBe('idle');
  });
});
