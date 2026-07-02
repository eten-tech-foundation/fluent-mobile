import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useRecorder } from './useRecorder';

const mockRecorder = {
  currentTime: 0,
  uri: 'file:///tmp/take-1.m4a',
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined),
  prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
};

const mockInsertRecording = jest.fn();
const mockDeleteRecordingById = jest.fn().mockResolvedValue(undefined);
const mockGetLatestRecordingForVerse = jest.fn().mockResolvedValue(null);
const mockGetPausedTake = jest.fn().mockReturnValue(null);
const mockSetPausedTake = jest.fn();
const mockClearPausedTake = jest.fn();

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

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1'),
}));

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  useAudioRecorder: () => mockRecorder,
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

jest.mock('../db/repository', () => ({
  insertRecording: (input: unknown) => mockInsertRecording(input),
  deleteRecordingById: (id: string) => mockDeleteRecordingById(id),
}));

jest.mock('../db/queries', () => ({
  getLatestRecordingForVerse: (id: number) =>
    mockGetLatestRecordingForVerse(id),
}));

const MOVED_KEY = 'recordings/u/p0/UNK/c000/v000/test-uuid-1.m4a';

jest.mock('../services/recordingStorage', () => ({
  buildRecordingKey: jest.fn(() => MOVED_KEY),
  extensionFromUri: jest.fn(() => 'm4a'),
  moveIntoStore: jest.fn(async ({ key }: { key: string }) => ({
    key,
    sizeBytes: 1234,
  })),
  resolveRecordingUri: jest.fn((pathOrKey: string) => pathOrKey),
}));

jest.mock('../services/storage', () => ({
  getPausedTake: (id: number) => mockGetPausedTake(id),
  setPausedTake: (marker: unknown) => mockSetPausedTake(marker),
  clearPausedTake: (id: number) => mockClearPausedTake(id),
}));

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
    mockGetLatestRecordingForVerse.mockResolvedValue(null);
    mockGetPausedTake.mockReturnValue(null);
    mockInsertRecording.mockImplementation(async input => ({
      id: input.id,
      bibleTextId: input.bibleTextId,
      localFilePath: input.localFilePath,
      durationMs: input.durationMs ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending' as const,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }));
  });

  it('starts in idle when the verse has no existing draft', async () => {
    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    expect(result.current.status).toBe('idle');
    expect(result.current.currentRecording).toBeNull();
  });

  it('starts in review when a draft already exists', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce({
      id: 'existing',
      bibleTextId: 42,
      localFilePath: '/tmp/existing.m4a',
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    });
    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    expect(result.current.status).toBe('review');
    expect(result.current.currentRecording?.id).toBe('existing');
  });

  it('surfaces a persisted paused-take marker on mount', async () => {
    mockGetPausedTake.mockReturnValueOnce({
      bibleTextId: 42,
      fileUri: '/tmp/paused.m4a',
      elapsedMs: 4500,
      startedAt: '2026-07-01T00:00:00.000Z',
    });
    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    expect(result.current.status).toBe('paused');
    expect(result.current.elapsedMs).toBe(4500);
  });

  it('transitions idle -> recording on start', async () => {
    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
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
      const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
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
      expect(mockSetPausedTake).toHaveBeenCalledWith(
        expect.objectContaining({
          bibleTextId: 42,
          fileUri: 'file:///tmp/take-1.m4a',
          elapsedMs: 2500,
        }),
      );
      expect(result.current.status).toBe('paused');
      expect(result.current.elapsedMs).toBe(2500);

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
      expect(mockInsertRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          bibleTextId: 42,
          localFilePath: MOVED_KEY,
          durationMs: 5500,
          fileSizeBytes: 1234,
        }),
      );
      expect(mockClearPausedTake).toHaveBeenCalledWith(42);
      expect(result.current.status).toBe('review');
    } finally {
      jest.useRealTimers();
    }
  });

  it('re-record starts a new recording and stop overwrites the previous draft', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce({
      id: 'existing',
      bibleTextId: 42,
      localFilePath: '/tmp/existing.m4a',
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    });

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
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

    expect(mockInsertRecording).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('review');
    expect(result.current.currentRecording?.id).not.toBe('existing');
  });

  it('delete removes the current draft and returns to idle', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce({
      id: 'existing',
      bibleTextId: 42,
      localFilePath: '/tmp/existing.m4a',
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    });

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);

    await act(async () => {
      await result.current.deleteCurrent();
    });

    expect(mockDeleteRecordingById).toHaveBeenCalledWith('existing');
    expect(result.current.status).toBe('idle');
    expect(result.current.currentRecording).toBeNull();
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

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
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

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    await waitFor(() => expect(result.current.permission).toBe('denied'));

    let response: { granted: boolean; canAskAgain: boolean } | undefined;
    await act(async () => {
      response = await result.current.requestPermission();
    });

    expect(response).toEqual({ granted: false, canAskAgain: false });
    expect(result.current.permission).toBe('blocked');
  });

  it('plays the current draft on togglePlayback from review', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce({
      id: 'existing',
      bibleTextId: 42,
      localFilePath: '/tmp/existing.m4a',
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    });

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
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
    mockGetLatestRecordingForVerse.mockResolvedValueOnce({
      id: 'existing',
      bibleTextId: 42,
      localFilePath: '/tmp/existing.m4a',
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    });
    mockPlayerStatus = { playing: true, didJustFinish: false };

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      await result.current.togglePlayback();
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('does not play when there is no draft to review', async () => {
    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.togglePlayback();
    });

    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('rewinds to the start when a take finishes playing', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce({
      id: 'existing',
      bibleTextId: 42,
      localFilePath: '/tmp/existing.m4a',
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    });
    mockPlayerStatus = { playing: false, didJustFinish: true };

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);

    await waitFor(() => expect(mockPlayer.seekTo).toHaveBeenCalledWith(0));
  });

  it('stops playback before re-recording an existing draft', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce({
      id: 'existing',
      bibleTextId: 42,
      localFilePath: '/tmp/existing.m4a',
      takeNumber: 1,
      isLatest: true,
      syncStatus: 'pending',
      createdAt: 'x',
      updatedAt: 'x',
    });
    mockPlayerStatus = { playing: true, didJustFinish: false };

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
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

    const { result } = renderHook(() => useRecorder({ bibleTextId: 42 }));
    await waitReady(result);

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      listeners.forEach(cb => cb('background'));
      await Promise.resolve();
    });

    expect(mockRecorder.pause).toHaveBeenCalled();
    expect(mockSetPausedTake).toHaveBeenCalled();
    expect(result.current.status).toBe('paused');

    addSpy.mockRestore();
  });
});
