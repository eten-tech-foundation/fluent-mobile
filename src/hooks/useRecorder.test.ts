import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useRecorder, type RecorderAdapter } from './useRecorder';

interface FakeTake {
  id: string;
  uri: string;
}

const mockRecorder = {
  currentTime: 0,
  uri: 'file:///tmp/take-1.m4a',
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
};

const mockUseAudioRecorder = jest.fn();

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  currentTime: 0,
  duration: 0,
};
let mockPlayerStatus: { playing?: boolean; didJustFinish?: boolean } = {
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
    deletePausedFile: jest.fn(),
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
    mockRecorder.uri = 'file:///tmp/take-1.m4a';
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
    expect(result.current.status).toBe('idle');
    expect(result.current.currentRecording).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('starts in idle when the session has no existing take', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe('idle');
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
    expect(result.current.status).toBe('review');
    expect(result.current.currentRecording?.id).toBe('existing');
  });

  it('surfaces a persisted paused-take marker on mount', async () => {
    const adapter = makeAdapter({
      loadPaused: jest.fn().mockReturnValue({
        fileUri: '/tmp/paused.m4a',
        elapsedMs: 4500,
        startedAt: '2026-07-01T00:00:00.000Z',
        sessionToken: 'stale-token',
      }),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe('paused');
    expect(result.current.elapsedMs).toBe(4500);
    expect(result.current.canResume).toBe(false);
  });

  it('does not resume a rehydrated paused take without a live native session', async () => {
    const adapter = makeAdapter({
      loadPaused: jest.fn().mockReturnValue({
        fileUri: '/tmp/paused.m4a',
        elapsedMs: 4500,
        startedAt: '2026-07-01T00:00:00.000Z',
        sessionToken: 'stale-token',
      }),
    });
    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);

    await act(async () => {
      await result.current.resume();
    });

    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(result.current.status).toBe('paused');
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
    expect(result.current.status).toBe('recording');
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
          fileUri: 'file:///tmp/take-1.m4a',
          elapsedMs: 2500,
          sessionToken: expect.any(String),
        }),
      );
      expect(result.current.status).toBe('paused');
      expect(result.current.elapsedMs).toBe(2500);
      expect(result.current.canResume).toBe(true);

      // Long pause window: elapsed stays put; resume starts a new active segment.
      jest.setSystemTime(new Date('2026-07-01T00:00:12.500Z'));
      await act(async () => {
        await result.current.resume();
      });
      expect(result.current.status).toBe('recording');
      expect(result.current.elapsedMs).toBe(2500);

      // Record for another 3s and stop; total active time = 5.5s, not 15.5s.
      jest.setSystemTime(new Date('2026-07-01T00:00:15.500Z'));
      await act(async () => {
        await result.current.stop();
      });

      expect(mockRecorder.stop).toHaveBeenCalled();
      expect(adapter.onCommit).toHaveBeenCalledWith({
        fileUri: 'file:///tmp/take-1.m4a',
        durationMs: 5500,
      });
      expect(adapter.clearPaused).toHaveBeenCalled();
      expect(result.current.status).toBe('review');
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
    expect(result.current.status).toBe('review');

    await act(async () => {
      await result.current.reRecord();
    });
    expect(mockRecorder.record).toHaveBeenCalled();
    expect(result.current.status).toBe('recording');

    mockRecorder.currentTime = 1;
    await act(async () => {
      await result.current.stop();
    });

    expect(adapter.onCommit).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('review');
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
    expect(result.current.status).toBe('idle');
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
    expect(result.current.status).toBe('idle');
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
    expect(result.current.status).toBe('review');
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
    expect(result.current.status).toBe('idle');
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
    expect(result.current.status).toBe('review');
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
    expect(result.current.status).toBe('review');
    expect(result.current.isPlaying).toBe(false);

    await act(async () => {
      await result.current.togglePlayback();
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
    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      await result.current.togglePlayback();
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('does not play when there is no take to review', async () => {
    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.togglePlayback();
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
    expect(result.current.status).toBe('paused');

    addSpy.mockRestore();
  });

  it('captures recordings into the durable document directory', async () => {
    const { result } = renderHook(() => useRecorder(makeAdapter()));
    await waitReady(result);

    expect(mockUseAudioRecorder).toHaveBeenCalledWith(
      expect.objectContaining({ directory: 'document' }),
    );
  });

  it('unlinks the durable partial file when a paused take is discarded', async () => {
    const adapter = makeAdapter({
      loadPaused: jest.fn().mockReturnValue({
        fileUri: 'file:///docs/partial-take.m4a',
        elapsedMs: 4500,
        startedAt: '2026-07-01T00:00:00.000Z',
        sessionToken: 'stale-token',
      }),
    });

    const { result } = renderHook(() => useRecorder(adapter));
    await waitReady(result);
    expect(result.current.status).toBe('paused');

    await act(async () => {
      await result.current.discardPaused();
    });

    expect(adapter.deletePausedFile).toHaveBeenCalledWith(
      'file:///docs/partial-take.m4a',
    );
    expect(adapter.clearPaused).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
