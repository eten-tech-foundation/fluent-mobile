import {
  createRecordingEngine,
  MIN_RECORDING_MS,
} from './createRecordingEngine';
import type {
  EngineRecorder,
  RecordingEngineDeps,
} from './createRecordingEngine';

function makeFakeRecorder(): EngineRecorder & {
  _uri: string | null;
  _time: number;
  _isRecording: boolean;
  calls: string[];
} {
  const state = {
    _uri: null as string | null,
    _time: 0,
    _isRecording: false,
    calls: [] as string[],
  };

  const fake: EngineRecorder & {
    _uri: string | null;
    _time: number;
    _isRecording: boolean;
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
    get _isRecording() {
      return state._isRecording;
    },
    set _isRecording(v: boolean) {
      state._isRecording = v;
    },
    get calls() {
      return state.calls;
    },
    get isRecording(): boolean {
      return state._isRecording;
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
      state._isRecording = true;
      state._time = 1.25;
    },
    pause() {
      state.calls.push('pause');
      state._isRecording = false;
    },
    async stop() {
      state.calls.push('stop');
      state._isRecording = false;
      state._uri = 'file:///mock-recording.m4a';
      state._time = 0;
    },
  };
  return fake;
}
/** Engine with the #979 hold off, so existing tests don't wait on real timers. */
function makeEngine(deps: RecordingEngineDeps) {
  return createRecordingEngine({ minRecordingMs: 0, ...deps });
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
    expect(recorder.calls).toEqual(['prepare', 'record', 'pause']);

    await engine.resume();
    expect(engine.getStatus()).toBe('recording');
    expect(recorder.calls).toEqual(['prepare', 'record', 'pause', 'record']);

    const result = await engine.stop();
    expect(engine.getStatus()).toBe('idle');
    expect(result).toEqual({
      uri: 'file:///mock-recording.m4a',
      durationMs: 1250,
    });
    expect(statuses).toEqual(['recording', 'paused', 'recording', 'idle']);
  });

  it('re-pauses the native recorder if Android auto-resumes while the UI is paused', async () => {
    const recorder = makeFakeRecorder();
    const engine = createRecordingEngine({ recorder });

    await engine.start();
    await engine.pause();
    recorder._isRecording = true;

    engine.syncPausedNativeState();
    expect(engine.getStatus()).toBe('paused');
    expect(recorder.calls).toEqual(['prepare', 'record', 'pause', 'pause']);
  });

  it('does not call native record again if Android is already recording on resume', async () => {
    const recorder = makeFakeRecorder();
    const engine = createRecordingEngine({ recorder });

    await engine.start();
    await engine.pause();
    recorder._isRecording = true;

    await engine.resume();
    expect(engine.getStatus()).toBe('recording');
    expect(recorder.calls).toEqual(['prepare', 'record', 'pause']);
  });

  it('does not record from a stale resume after stop completes during audio-mode setup', async () => {
    const recorder = makeFakeRecorder();
    let resolvePrepareAudioMode!: () => void;
    const prepareAudioMode = jest
      .fn<Promise<void>, []>()
      .mockResolvedValueOnce(undefined)
      .mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolvePrepareAudioMode = resolve;
          }),
      );
    const engine = createRecordingEngine({ recorder, prepareAudioMode });

    await engine.start();
    await engine.pause();
    const resumePromise = engine.resume();
    await engine.stop();
    resolvePrepareAudioMode();
    await resumePromise;

    expect(engine.getStatus()).toBe('idle');
    expect(recorder.calls).toEqual(['prepare', 'record', 'pause', 'stop']);
  });

  it('does not call native record if Android resumes during audio-mode setup', async () => {
    const recorder = makeFakeRecorder();
    let resolvePrepareAudioMode!: () => void;
    const prepareAudioMode = jest
      .fn<Promise<void>, []>()
      .mockResolvedValueOnce(undefined)
      .mockImplementation(
        () =>
          new Promise<void>(resolve => {
            resolvePrepareAudioMode = resolve;
          }),
      );
    const engine = createRecordingEngine({ recorder, prepareAudioMode });

    await engine.start();
    await engine.pause();
    const resumePromise = engine.resume();
    recorder._isRecording = true;
    resolvePrepareAudioMode();
    await resumePromise;

    expect(engine.getStatus()).toBe('recording');
    expect(recorder.calls).toEqual(['prepare', 'record', 'pause']);
  });

  it('prepares audio mode before first start and resume', async () => {
    const recorder = makeFakeRecorder();
    const prepareAudioMode = jest.fn(async () => undefined);
    const engine = createRecordingEngine({ recorder, prepareAudioMode });

    await engine.start();
    await engine.pause();
    await engine.resume();
    expect(prepareAudioMode).toHaveBeenCalledTimes(2);
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

  it('resolves null, not an error, and still releases audio mode when stop yields no uri', async () => {
    const recorder = makeFakeRecorder();
    const releaseAudioMode = jest.fn(async () => undefined);
    recorder.stop = async () => {
      recorder.calls.push('stop');
      recorder._uri = null;
      recorder._time = 0;
    };
    const engine = makeEngine({ recorder, releaseAudioMode });
    await engine.start();
    await expect(engine.stop()).resolves.toBeNull();
    expect(releaseAudioMode).toHaveBeenCalledTimes(1);
    expect(engine.getStatus()).toBe('idle');
  });

  it('returns idle and releases audio after native stop failure, then freshly prepares a retry', async () => {
    const recorder = makeFakeRecorder();
    const stopFailure = new Error('native stop failed');
    const nativeStop = recorder.stop.bind(recorder);
    recorder.stop = jest
      .fn()
      .mockRejectedValueOnce(stopFailure)
      .mockImplementation(nativeStop);
    const releaseAudioMode = jest.fn(async () => undefined);
    const engine = createRecordingEngine({ recorder, releaseAudioMode });

    await engine.start();
    await expect(engine.stop()).rejects.toBe(stopFailure);
    expect(engine.getStatus()).toBe('idle');
    expect(releaseAudioMode).toHaveBeenCalledTimes(1);

    await engine.start();
    expect(recorder.calls).toEqual(['prepare', 'record', 'prepare', 'record']);
    await expect(engine.stop()).resolves.toEqual({
      uri: 'file:///mock-recording.m4a',
      durationMs: 1250,
    });
    expect(releaseAudioMode).toHaveBeenCalledTimes(2);
  });

  it('retains the valid take result when best-effort audio release rejects', async () => {
    const recorder = makeFakeRecorder();
    const releaseAudioMode = jest
      .fn()
      .mockRejectedValue(new Error('mode reset failed'));
    const engine = createRecordingEngine({ recorder, releaseAudioMode });

    await engine.start();
    await expect(engine.stop()).resolves.toEqual({
      uri: 'file:///mock-recording.m4a',
      durationMs: 1250,
    });
    expect(engine.getStatus()).toBe('idle');
    expect(releaseAudioMode).toHaveBeenCalledTimes(1);
  });

  it('can resume and save after pausing without a recovery URI', async () => {
    const recorder = makeFakeRecorder();
    const engine = createRecordingEngine({ recorder });

    await engine.start();
    expect(recorder.uri).toBeNull();
    await expect(engine.pause()).resolves.toBeNull();
    expect(engine.getStatus()).toBe('paused');
    expect(recorder.isRecording).toBe(false);

    await engine.resume();
    await expect(engine.stop()).resolves.toEqual({
      uri: 'file:///mock-recording.m4a',
      durationMs: 1250,
    });
    expect(recorder.calls).toEqual([
      'prepare',
      'record',
      'pause',
      'record',
      'stop',
    ]);
  });

  it('retries failed native preparation without publishing a phantom recording', async () => {
    const recorder = makeFakeRecorder();
    const prepareFailure = new Error('native prepare failed');
    const nativePrepare = recorder.prepareToRecordAsync.bind(recorder);
    recorder.prepareToRecordAsync = jest
      .fn()
      .mockRejectedValueOnce(prepareFailure)
      .mockImplementation(nativePrepare);
    const onStatusChange = jest.fn();
    const prepareAudioMode = jest.fn(async () => undefined);
    const engine = createRecordingEngine({
      recorder,
      prepareAudioMode,
      onStatusChange,
    });

    await expect(engine.start()).rejects.toBe(prepareFailure);
    expect(engine.getStatus()).toBe('idle');
    expect(recorder.isRecording).toBe(false);
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(recorder.calls).toEqual([]);

    await engine.start();
    expect(prepareAudioMode).toHaveBeenCalledTimes(2);
    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenCalledWith('recording');
    await engine.stop();
  });

  describe('createRecordingEngine pause and stop right after start (#979)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('holds stop before the native call until the recorder has run the minimum', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      const stopped = engine.stop();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS - 1);
      expect(recorder.calls).not.toContain('stop');
      expect(engine.getStatus()).toBe('recording');

      await jest.advanceTimersByTimeAsync(1);
      await expect(stopped).resolves.toEqual({
        uri: 'file:///mock-recording.m4a',
        durationMs: 1250,
      });
      expect(recorder.calls).toContain('stop');
      expect(engine.getStatus()).toBe('idle');
    });

    it('waits only for what is left of the minimum since the recorder started', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS - 200);

      const stopped = engine.stop();
      await jest.advanceTimersByTimeAsync(199);
      expect(recorder.calls).not.toContain('stop');
      await jest.advanceTimersByTimeAsync(1);
      await stopped;
      expect(recorder.calls).toContain('stop');
    });

    it('does not wait when the take has already run the minimum', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS);

      // No timer is advanced: a wait here would never resolve.
      await expect(engine.stop()).resolves.toEqual(
        expect.objectContaining({ uri: 'file:///mock-recording.m4a' }),
      );
    });

    it('holds pause before the native call too, and keeps the take recording meanwhile', async () => {
      const recorder = makeFakeRecorder();
      recorder._uri = 'file:///segment.m4a';
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      const paused = engine.pause();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS - 1);
      expect(recorder.calls).not.toContain('pause');
      expect(engine.getStatus()).toBe('recording');

      await jest.advanceTimersByTimeAsync(1);
      await expect(paused).resolves.toEqual({
        uri: 'file:///segment.m4a',
        durationMs: 1250,
      });
      expect(recorder.calls).toContain('pause');
      expect(engine.getStatus()).toBe('paused');
    });

    it('does not wait for a later take once the recorder has stopped', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS);
      await engine.stop();

      await engine.start();
      const stopped = engine.stop();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS);
      await expect(stopped).resolves.not.toBeNull();
    });

    it('drops a pause that was pressed before a stop during the hold', async () => {
      const recorder = makeFakeRecorder();
      recorder._uri = 'file:///segment.m4a';
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      const paused = engine.pause();
      const stopped = engine.stop();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS);

      await expect(paused).resolves.toBeNull();
      await expect(stopped).resolves.not.toBeNull();
      expect(recorder.calls.filter(c => c === 'pause')).toHaveLength(0);
      expect(recorder.calls.filter(c => c === 'stop')).toHaveLength(1);
      expect(engine.getStatus()).toBe('idle');
    });

    it('ignores a pause pressed after a stop during the hold', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      const stopped = engine.stop();
      await expect(engine.pause()).resolves.toBeNull();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS);
      await stopped;

      expect(recorder.calls).not.toContain('pause');
      expect(recorder.calls.filter(c => c === 'stop')).toHaveLength(1);
    });

    it('joins a second stop to the one in flight: one native stop, same result', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      const first = engine.stop();
      const second = engine.stop();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS);

      const [a, b] = await Promise.all([first, second]);
      expect(b).toEqual(a);
      expect(recorder.calls.filter(c => c === 'stop')).toHaveLength(1);
    });

    it('stops at once for teardown when asked, without the hold', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      // No timer is advanced: a hold here would never resolve.
      await engine.stop({ immediate: true });

      expect(recorder.calls).toContain('stop');
      expect(engine.getStatus()).toBe('idle');
    });

    it('releases a held stop when teardown asks for an immediate one', async () => {
      const recorder = makeFakeRecorder();
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      const held = engine.stop();
      const teardown = engine.stop({ immediate: true });

      // No timer is advanced: the immediate stop must release the hold itself.
      await expect(teardown).resolves.not.toBeNull();
      await expect(held).resolves.not.toBeNull();
      expect(recorder.calls.filter(c => c === 'stop')).toHaveLength(1);
      expect(engine.getStatus()).toBe('idle');
    });

    it('resolves null after the hold when the recorder still wrote no file', async () => {
      const recorder = makeFakeRecorder();
      recorder.stop = async () => {
        recorder.calls.push('stop');
        recorder._uri = null;
      };
      const engine = createRecordingEngine({ recorder });
      await engine.start();

      const stopped = engine.stop();
      await jest.advanceTimersByTimeAsync(MIN_RECORDING_MS);
      await expect(stopped).resolves.toBeNull();
      expect(engine.getStatus()).toBe('idle');
    });
  });
});
