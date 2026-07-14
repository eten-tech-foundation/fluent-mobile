import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import {
  useRecorder,
  dbfsToLevel,
  METERING_FLOOR_DB,
  METERING_SAMPLE_CAP,
  type RecorderAdapter,
  RecorderStatus,
} from './useRecorder';

interface FakeTake {
  id: string;
  uri: string;
}

// dBFS input level returned by `getStatus()`; tests mutate it to simulate audio.
let mockMetering: number | undefined;

const mockRecorder = {
  currentTime: 0,
  uri: 'file:///tmp/take-1.aac',
  isRecording: false,
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
  // Only `.metering` is read by the hook; other fields round out RecorderState.
  // Don't reference `mockRecorder` here (avoids self-referential implicit-any).
  getStatus: jest.fn(() => ({
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    metering: mockMetering,
    url: null,
  })),
};

const mockUseAudioRecorder = jest.fn();

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  currentTime: 0,
  duration: 0,
};
let mockPlayerStatus: {
  playing?: boolean;
  didJustFinish?: boolean;
  currentTime?: number;
  duration?: number;
} = {
  playing: false,
  didJustFinish: false,
};

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: (options: unknown) => {
    mockUseAudioRecorder(options);
    return mockRecorder;
  },
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockPlayerStatus,
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  }),
  getRecordingPermissionsAsync: jest.fn().mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

const COMMITTED_TAKE: FakeTake = {
  id: 'take-1',
  uri: 'file:///committed/take-1.m4a',
};

function makeAdapter(
  overrides: Partial<RecorderAdapter<FakeTake>> = {},
): RecorderAdapter<FakeTake> {
  return {
    sessionKey: 42,
    loadInitial: jest.fn().mockResolvedValue(null),
    onCommit: jest.fn().mockResolvedValue(COMMITTED_TAKE),
    deleteCommitted: jest.fn().mockResolvedValue(undefined),
    resolvePlaybackUri: jest.fn((take: FakeTake) => take.uri),
    loadPaused: jest.fn().mockReturnValue(null),
    persistPaused: jest.fn(),
    clearPaused: jest.fn(),
    deletePausedFiles: jest.fn(),
    ...overrides,
  };
}

async function waitReady(result: { current: { isReady: boolean } }) {
  await waitFor(() => expect(result.current.isReady).toBe(true));
}

describe('useRecorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.currentTime = 0;
    mockRecorder.uri = 'file:///tmp/take-1.aac';
    mockRecorder.isRecording = false;
    mockMetering = undefined;
    mockPlayer.currentTime = 0;
    mockPlayer.duration = 0;
    mockPlayerStatus = { playing: false, didJustFinish: false };
    // Default AppState subscription so the background-listener cleanup has a
    // valid `remove()` on unmount; individual tests may override the impl.
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({
      remove: jest.fn(),
    } as unknown as ReturnType<typeof AppState.addEventListener>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stays inert while the session key is null', async () => {
    const adapter = makeAdapter({ sessionKey: null });
    const { result } = renderHook(() => useRecorder(adapter));
    // A null session never becomes ready and never queries the adapter.
    await waitFor(() => expect(adapter.loadInitial).not.toHaveBeenCalled());
    expect(result.current.status).toBe(RecorderStatus.Idle);
    expect(result.current.currentRecording).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('starts in idle when the session has no existing take', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Idle);
    expect(result.current.currentRecording).toBeNull();
    expect(adapter.loadInitial).toHaveBeenCalledWith(42);
  });

  it('starts in review when a take already exists', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Review);
    expect(result.current.currentRecording?.id).toBe('existing');
  });

  it('surfaces a persisted paused-take marker on mount as a recoverable, resumable take', async () => {
    const adapter = makeAdapter({
      loadPaused: jest.fn().mockReturnValue({
        segments: ['/tmp/paused-0.aac'],
        elapsedMs: 4500,
        startedAt: '2026-07-01T00:00:00.000Z',
        sessionToken: 'stale-token',
      }),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Paused);
    expect(result.current.elapsedMs).toBe(4500);
    expect(result.current.canResume).toBe(true);
    expect(result.current.isRecovered).toBe(true);
  });

  it('resumes a rehydrated paused take by opening a new appended segment', async () => {
    const adapter = makeAdapter({
      loadPaused: jest.fn().mockReturnValue({
        segments: ['/tmp/paused-0.aac'],
        elapsedMs: 4500,
        startedAt: '2026-07-01T00:00:00.000Z',
        sessionToken: 'stale-token',
      }),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    // The previous native recorder died with the process, so resume must open a
    // fresh session (prepare + record) rather than resume a native session.
    await act(async () => {
      await result.current.resume();
    });

    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Recording);
    // Elapsed time is preserved across the kill (rehydrated base of 4.5s).
    expect(result.current.elapsedMs).toBe(4500);
    expect(result.current.isRecovered).toBe(false);
  });

  it('commits a rehydrated take when Stop is pressed straight from the recovery prompt', async () => {
    const adapter = makeAdapter({
      loadPaused: jest.fn().mockReturnValue({
        segments: ['/tmp/paused-0.aac', '/tmp/paused-1.aac'],
        elapsedMs: 7200,
        startedAt: '2026-07-01T00:00:00.000Z',
        sessionToken: 'stale-token',
      }),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Paused);

    await act(async () => {
      await result.current.stop();
    });

    // No live native recorder, so we must not call stop() on it, but we still
    // commit the persisted segments with the rehydrated elapsed time.
    expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(adapter.onCommit).toHaveBeenCalledWith({
      fileUris: ['/tmp/paused-0.aac', '/tmp/paused-1.aac'],
      durationMs: 7200,
    });
    expect(adapter.clearPaused).toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Review);
  });

  it('commits every segment of a take resumed after a kill', async () => {
    jest.useFakeTimers();
    try {
      const adapter = makeAdapter({
        loadPaused: jest.fn().mockReturnValue({
          segments: ['/tmp/paused-0.aac'],
          elapsedMs: 4500,
          startedAt: '2026-07-01T00:00:00.000Z',
          sessionToken: 'stale-token',
        }),
      });
      const { result } = renderHook(() => useRecorder(adapter));
      await waitReady(result);

      // The new session records into a distinct segment file.
      mockRecorder.uri = 'file:///tmp/paused-1.aac';
      jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
      await act(async () => {
        await result.current.resume();
      });

      jest.setSystemTime(new Date('2026-07-01T00:00:01.000Z'));
      await act(async () => {
        await result.current.stop();
      });

      expect(adapter.onCommit).toHaveBeenCalledWith({
        fileUris: ['/tmp/paused-0.aac', 'file:///tmp/paused-1.aac'],
        durationMs: 5500,
      });
      expect(result.current.status).toBe(RecorderStatus.Review);
    } finally {
      jest.useRealTimers();
    }
  });

  it('transitions idle -> recording on start', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });

    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Recording);
  });

  it('persists a recoverable marker as soon as recording starts', async () => {
    // A hard process kill can happen before any pause/background event runs, so
    // the manifest must exist from the first moment of recording.
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });

    expect(adapter.persistPaused).toHaveBeenCalledWith(
      expect.objectContaining({
        segments: ['file:///tmp/take-1.aac'],
        elapsedMs: 0,
        sessionToken: expect.any(String),
      }),
    );
  });

  it('accumulates only active recording time across pause and resume', async () => {
    jest.useFakeTimers();

    try {
      const adapter = makeAdapter();
      const { result } = renderHook(() => useRecorder(adapter));
      await waitReady(result);

      // Anchor after mount so `waitFor`'s internal poll drift doesn't skew t0.
      jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
      await act(async () => {
        await result.current.start();
      });

      jest.setSystemTime(new Date('2026-07-01T00:00:02.500Z'));
      await act(async () => {
        await result.current.pause();
      });

      expect(mockRecorder.pause).toHaveBeenCalled();
      expect(adapter.persistPaused).toHaveBeenCalledWith(
        expect.objectContaining({
          segments: ['file:///tmp/take-1.aac'],
          elapsedMs: 2500,
          sessionToken: expect.any(String),
        }),
      );
      expect(result.current.status).toBe(RecorderStatus.Paused);
      expect(result.current.elapsedMs).toBe(2500);
      expect(result.current.canResume).toBe(true);

      // Long pause window: elapsed stays put; resume starts a new active segment.
      jest.setSystemTime(new Date('2026-07-01T00:00:12.500Z'));
      await act(async () => {
        await result.current.resume();
      });
      expect(result.current.status).toBe(RecorderStatus.Recording);
      expect(result.current.elapsedMs).toBe(2500);

      // Record for another 3s and stop; total active time = 5.5s, not 15.5s.
      jest.setSystemTime(new Date('2026-07-01T00:00:15.500Z'));
      await act(async () => {
        await result.current.stop();
      });

      expect(mockRecorder.stop).toHaveBeenCalled();
      expect(adapter.onCommit).toHaveBeenCalledWith({
        fileUris: ['file:///tmp/take-1.aac'],
        durationMs: 5500,
      });
      expect(adapter.clearPaused).toHaveBeenCalled();
      expect(result.current.status).toBe(RecorderStatus.Review);
      expect(result.current.currentRecording?.id).toBe('take-1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-record starts a new recording and stop overwrites the previous take', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Review);

    await act(async () => {
      await result.current.reRecord();
    });
    expect(mockRecorder.record).toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Recording);

    mockRecorder.currentTime = 1;
    await act(async () => {
      await result.current.stop();
    });

    expect(adapter.onCommit).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe(RecorderStatus.Review);
    expect(result.current.currentRecording?.id).toBe('take-1');
  });

  it('reverts without committing when the adapter reports a commit failure', async () => {
    const adapter = makeAdapter({
      onCommit: jest.fn().mockResolvedValue(null),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(adapter.onCommit).toHaveBeenCalled();
    expect(adapter.clearPaused).not.toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Idle);
    expect(result.current.currentRecording).toBeNull();
  });

  it('reverts without committing when recorder.stop throws', async () => {
    mockRecorder.stop.mockRejectedValueOnce(new Error('stop failed'));
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(adapter.onCommit).not.toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Idle);
  });

  it('returns to review when recorder.stop throws during re-record', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    mockRecorder.stop.mockRejectedValueOnce(new Error('stop failed'));
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.reRecord();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(adapter.onCommit).not.toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Review);
    expect(result.current.currentRecording?.id).toBe('existing');
  });

  it('delete removes the current take and returns to idle', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.deleteCurrent();
    });

    expect(adapter.deleteCommitted).toHaveBeenCalledWith(existing);
    expect(result.current.status).toBe(RecorderStatus.Idle);
    expect(result.current.currentRecording).toBeNull();
  });

  it('keeps the current take in review when deleteCommitted throws', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
      deleteCommitted: jest.fn().mockRejectedValue(new Error('delete failed')),
    });

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.deleteCurrent();
    });

    expect(adapter.deleteCommitted).toHaveBeenCalledWith(existing);
    expect(result.current.status).toBe(RecorderStatus.Review);
    expect(result.current.currentRecording?.id).toBe('existing');
  });

  it('reports blocked permission when the OS has suppressed the prompt', async () => {
    const expoAudio = jest.requireMock('expo-audio') as {
      getRecordingPermissionsAsync: jest.Mock;
    };
    expoAudio.getRecordingPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: 'denied',
    });

    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);
    await waitFor(() => expect(result.current.permission).toBe('blocked'));
  });

  it('surfaces canAskAgain from requestPermission and updates state accordingly', async () => {
    const expoAudio = jest.requireMock('expo-audio') as {
      getRecordingPermissionsAsync: jest.Mock;
      requestRecordingPermissionsAsync: jest.Mock;
    };
    expoAudio.getRecordingPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
    });
    expoAudio.requestRecordingPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: 'denied',
    });

    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);
    await waitFor(() => expect(result.current.permission).toBe('denied'));

    let response: { granted: boolean; canAskAgain: boolean } | undefined;
    await act(async () => {
      response = await result.current.requestPermission();
    });

    expect(response).toEqual({ granted: false, canAskAgain: false });
    expect(result.current.permission).toBe('blocked');
  });

  it('plays the current take on togglePlayback from review', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Review);
    expect(result.current.playback.isPlaying).toBe(false);

    await act(async () => {
      await result.current.playback.toggle();
    });

    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
  });

  it('pauses playback when toggled while already playing', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });
    mockPlayerStatus = { playing: true, didJustFinish: false };

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.playback.isPlaying).toBe(true);

    await act(async () => {
      await result.current.playback.toggle();
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('does not play when there is no take to review', async () => {
    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Idle);

    await act(async () => {
      await result.current.playback.toggle();
    });

    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('rewinds to the start when a take finishes playing', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });
    mockPlayerStatus = { playing: false, didJustFinish: true };

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await waitFor(() => expect(mockPlayer.seekTo).toHaveBeenCalledWith(0));
  });

  it('seeks the current take on seekPlayback from review', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Review);

    await act(async () => {
      await result.current.playback.seek(4500);
    });

    expect(mockPlayer.seekTo).toHaveBeenCalledWith(4.5);
  });

  it('does not seek when there is no take to review', async () => {
    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Idle);

    await act(async () => {
      await result.current.playback.seek(1000);
    });

    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  });

  it('exposes playback position and duration in ms from the player status', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });
    mockPlayerStatus = {
      playing: true,
      didJustFinish: false,
      currentTime: 2,
      duration: 8,
    };

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    expect(result.current.playback.positionMs).toBe(2000);
    expect(result.current.playback.durationMs).toBe(8000);
  });

  it('stops playback before re-recording an existing take', async () => {
    const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
    const adapter = makeAdapter({
      loadInitial: jest.fn().mockResolvedValue(existing),
    });
    mockPlayerStatus = { playing: true, didJustFinish: false };

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.reRecord();
    });

    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(mockRecorder.record).toHaveBeenCalled();
  });

  it('auto-pauses when the app is backgrounded during recording', async () => {
    const listeners: Array<(state: string) => void> = [];
    const addSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((_event: string, cb: (state: string) => void) => {
        listeners.push(cb);
        return { remove: jest.fn() };
      }) as unknown as typeof AppState.addEventListener);

    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      listeners.forEach(cb => cb('background'));
      await Promise.resolve();
    });

    expect(mockRecorder.pause).toHaveBeenCalled();
    expect(adapter.persistPaused).toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Paused);

    addSpy.mockRestore();
  });

  it('undoes the native auto-resume when returning to the foreground', async () => {
    const listeners: Array<(state: string) => void> = [];
    const addSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((_event: string, cb: (state: string) => void) => {
        listeners.push(cb);
        return { remove: jest.fn() };
      }) as unknown as typeof AppState.addEventListener);

    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      listeners.forEach(cb => cb('background'));
      await Promise.resolve();
    });
    expect(result.current.status).toBe(RecorderStatus.Paused);

    // Simulate expo-audio's native OnActivityEntersForeground auto-resume,
    // which flips the native recorder back to recording before our JS handler.
    mockRecorder.pause.mockClear();
    mockRecorder.isRecording = true;

    await act(async () => {
      listeners.forEach(cb => cb('active'));
      await Promise.resolve();
    });

    // We re-pause the native recorder and keep our state paused.
    expect(mockRecorder.pause).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe(RecorderStatus.Paused);

    addSpy.mockRestore();
  });

  it('resumes without restarting a recorder that is already recording', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.pause();
    });
    expect(result.current.status).toBe(RecorderStatus.Paused);

    // Native recorder is already recording (e.g. auto-resumed on foreground);
    // resume() must not call record() again or it would double-start and throw.
    mockRecorder.record.mockClear();
    mockRecorder.isRecording = true;

    await act(async () => {
      await result.current.resume();
    });

    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Recording);
  });

  it('captures recordings into the durable document directory', async () => {
    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);

    expect(mockUseAudioRecorder).toHaveBeenCalledWith(
      expect.objectContaining({ directory: 'document' }),
    );
  });

  it('enables metering on the recorder', async () => {
    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);

    expect(mockUseAudioRecorder).toHaveBeenCalledWith(
      expect.objectContaining({ isMeteringEnabled: true }),
    );
  });

  it('samples normalized metering into a bounded buffer while recording, and freezes it on pause', async () => {
    jest.useFakeTimers();
    try {
      const adapter = makeAdapter();
      const { result } = renderHook(() => useRecorder(adapter));
      await waitReady(result);
      expect(result.current.meteringLevels).toEqual([]);

      // -30 dBFS is the midpoint of the default [-60, 0] range -> ~0.5.
      mockMetering = -30;
      await act(async () => {
        await result.current.start();
      });

      // Advance well past the sample cap to confirm the buffer stays bounded.
      await act(async () => {
        jest.advanceTimersByTime(50 * (METERING_SAMPLE_CAP + 10));
      });

      const levels = result.current.meteringLevels;
      expect(levels.length).toBe(METERING_SAMPLE_CAP);
      expect(levels.every(level => level >= 0 && level <= 1)).toBe(true);
      expect(levels[levels.length - 1]).toBeCloseTo(0.5, 5);

      // Pause clears the tick, so the buffer must stop growing and stay put.
      await act(async () => {
        await result.current.pause();
      });
      const frozen = [...result.current.meteringLevels];
      await act(async () => {
        jest.advanceTimersByTime(50 * 10);
      });
      expect(result.current.meteringLevels).toEqual(frozen);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resets the metering buffer when a new take starts', async () => {
    jest.useFakeTimers();
    try {
      const existing: FakeTake = { id: 'existing', uri: '/tmp/existing.m4a' };
      const adapter = makeAdapter({
        loadInitial: jest.fn().mockResolvedValue(existing),
      });
      const { result } = renderHook(() => useRecorder(adapter));
      await waitReady(result);

      mockMetering = -10;
      await act(async () => {
        await result.current.reRecord();
      });
      await act(async () => {
        jest.advanceTimersByTime(50 * 3);
      });
      expect(result.current.meteringLevels.length).toBeGreaterThan(0);

      await act(async () => {
        await result.current.stop();
      });
      // A fresh take must start from an empty buffer, not the previous take's.
      await act(async () => {
        await result.current.reRecord();
      });
      expect(result.current.meteringLevels).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('unlinks the finalized file when an active recording is discarded without a paused marker', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe(RecorderStatus.Recording);

    await act(async () => {
      await result.current.discardPaused();
    });

    expect(adapter.deletePausedFiles).toHaveBeenCalledWith([
      'file:///tmp/take-1.aac',
    ]);
    expect(adapter.clearPaused).toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Idle);
  });

  it('unlinks every partial segment when a paused take is discarded', async () => {
    const adapter = makeAdapter({
      loadPaused: jest.fn().mockReturnValue({
        segments: [
          'file:///docs/partial-take-0.aac',
          'file:///docs/partial-take-1.aac',
        ],
        elapsedMs: 4500,
        startedAt: '2026-07-01T00:00:00.000Z',
        sessionToken: 'stale-token',
      }),
    });

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe(RecorderStatus.Paused);

    await act(async () => {
      await result.current.discardPaused();
    });

    expect(adapter.deletePausedFiles).toHaveBeenCalledWith([
      'file:///docs/partial-take-0.aac',
      'file:///docs/partial-take-1.aac',
    ]);
    expect(adapter.clearPaused).toHaveBeenCalled();
    expect(result.current.status).toBe(RecorderStatus.Idle);
  });
});

describe('dbfsToLevel', () => {
  it('returns 0 for missing or invalid readings', () => {
    expect(dbfsToLevel(undefined)).toBe(0);
    expect(dbfsToLevel(null)).toBe(0);
    expect(dbfsToLevel(NaN)).toBe(0);
    expect(dbfsToLevel(-Infinity)).toBe(0);
  });

  it('maps the floor to 0 and 0 dBFS to 1', () => {
    expect(dbfsToLevel(METERING_FLOOR_DB)).toBe(0);
    expect(dbfsToLevel(0)).toBe(1);
  });

  it('linearly interpolates between the floor and 0 dBFS', () => {
    expect(dbfsToLevel(-30)).toBeCloseTo(0.5, 5);
    expect(dbfsToLevel(-15)).toBeCloseTo(0.75, 5);
  });

  it('clamps readings outside the range', () => {
    expect(dbfsToLevel(-120)).toBe(0);
    expect(dbfsToLevel(6)).toBe(1);
  });

  it('honors a custom floor', () => {
    expect(dbfsToLevel(-20, -40)).toBeCloseTo(0.5, 5);
  });
});
