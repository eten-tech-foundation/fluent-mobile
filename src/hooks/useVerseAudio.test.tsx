import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useVerseAudio } from './useVerseAudio';
import type { Recording } from '../types/db/types';

const mockRecordingStart = jest.fn();
const mockRecordingStop = jest.fn();
const mockRecordingPause = jest.fn();
const mockRecordingResume = jest.fn();
const mockPlaybackPlay = jest.fn();
const mockPlaybackStop = jest.fn();
const mockPlaybackPause = jest.fn();
const mockPlaybackLoad = jest.fn();
const mockPlaybackSeek = jest.fn();
const mockFileExists = jest.fn();
const mockFileSize = jest.fn();
const mockDeleteFile = jest.fn();

const playbackState = { status: 'idle' as 'idle' | 'playing' | 'paused' };

jest.mock('./useRecordingEngine', () => ({
  useRecordingEngine: () => ({
    start: mockRecordingStart,
    stop: mockRecordingStop,
    pause: mockRecordingPause,
    resume: mockRecordingResume,
    status: 'idle',
  }),
}));

jest.mock('./usePlaybackEngine', () => ({
  usePlaybackEngine: () => ({
    play: async (...args: unknown[]) => {
      playbackState.status = 'playing';
      return mockPlaybackPlay(...args);
    },
    stop: async (...args: unknown[]) => {
      playbackState.status = 'idle';
      return mockPlaybackStop(...args);
    },
    pause: async (...args: unknown[]) => {
      playbackState.status = 'paused';
      return mockPlaybackPause(...args);
    },
    load: mockPlaybackLoad,
    seek: mockPlaybackSeek,
    get status() {
      return playbackState.status;
    },
    positionMs: 0,
    durationMs: 0,
  }),
}));

jest.mock('../utils/audioStorage', () => ({
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  ensureRecordingsDir: jest.fn(),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  fileSize: (...args: unknown[]) => mockFileSize(...args),
  recordingPath: jest.fn((id: string) => `/recordings/${id}.m4a`),
}));

function makeTake(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 'rec_1',
    bibleTextId: 42,
    localFilePath: '/recordings/rec_1.m4a',
    durationMs: 1000,
    fileSizeBytes: 100,
    takeNumber: 1,
    isSelected: true,
    isCanonical: false,

    syncStatus: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useVerseAudio', () => {
  const loadTakes = jest.fn();
  const persistTake = jest.fn();
  const deleteTake = jest.fn();
  const selectTake = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    playbackState.status = 'idle';
    loadTakes.mockResolvedValue([]);
    persistTake.mockResolvedValue({
      id: 'rec_new',
      localFilePath: '/recordings/rec_new.m4a',
    });
    deleteTake.mockResolvedValue(undefined);
    selectTake.mockResolvedValue(undefined);
    mockRecordingStart.mockResolvedValue(undefined);
    mockRecordingStop.mockResolvedValue({
      uri: 'file:///tmp/take.m4a',
      durationMs: 500,
    });
    mockRecordingPause.mockResolvedValue(undefined);
    mockRecordingResume.mockResolvedValue(undefined);
    mockPlaybackPlay.mockResolvedValue(undefined);
    mockPlaybackStop.mockResolvedValue(undefined);
    mockPlaybackPause.mockResolvedValue(undefined);
    mockPlaybackLoad.mockResolvedValue(undefined);
    mockPlaybackSeek.mockResolvedValue(undefined);
    mockFileExists.mockResolvedValue(true);
    mockFileSize.mockResolvedValue(128);
    mockDeleteFile.mockResolvedValue(undefined);
  });

  it('rehydrates to idle when there are no takes', async () => {
    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => {
      expect(loadTakes).toHaveBeenCalledWith(42);
      expect(result.current.state).toBe('idle');
      expect(result.current.takes).toEqual([]);
    });
  });

  it('rehydrates to recorded when takes exist', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe('recorded');
      expect(result.current.takes).toEqual([take]);
      expect(result.current.selectedTake?.id).toBe('rec_1');
    });
  });

  it('surfaces load failures as error state', async () => {
    loadTakes.mockRejectedValue(new Error('db down'));

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => {
      expect(result.current.state).toBe('error');
    });
  });

  it('starts recording and transitions idle → recording', async () => {
    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });

    expect(mockPlaybackStop).toHaveBeenCalled();
    expect(mockRecordingStart).toHaveBeenCalled();
    expect(result.current.state).toBe('recording');
    expect(result.current.errorMessage).toBeNull();
  });

  it('sets errorMessage when start fails', async () => {
    mockRecordingStart.mockRejectedValue(new Error('mic denied'));

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('mic denied');
  });

  it('stops recording, persists the take, and lands in recorded', async () => {
    const saved = makeTake({ id: 'rec_new', isSelected: true });
    loadTakes.mockResolvedValueOnce([]).mockResolvedValueOnce([saved]);

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(mockRecordingStop).toHaveBeenCalled();
    expect(persistTake).toHaveBeenCalledWith({
      bibleTextId: 42,
      tempUri: 'file:///tmp/take.m4a',
      durationMs: 500,
    });
    expect(result.current.state).toBe('recorded');
    expect(result.current.takes).toEqual([saved]);
  });

  it('plays a take when the file exists', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playTake(take);
    });

    expect(mockFileExists).toHaveBeenCalledWith(take.localFilePath);
    expect(mockPlaybackPlay).toHaveBeenCalledWith(take.localFilePath);
    expect(result.current.state).toBe('playing');
    expect(result.current.playingTakeId).toBe('rec_1');
    expect(result.current.loadedTakeId).toBe('rec_1');
  });

  it('errors when playTake file is missing', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);
    mockFileExists.mockResolvedValue(false);

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playTake(take);
    });

    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toMatch(/missing on disk/i);
    expect(result.current.playingTakeId).toBeNull();
  });

  it('does not overwrite the new verse takes when setCanonical resolves for a stale verse (regression)', async () => {
    const takeA = makeTake({ id: 'rec_a', bibleTextId: 42 });
    const takeB = makeTake({ id: 'rec_b', bibleTextId: 43 });

    let resolveDesignate: () => void;
    const designateCanonical = jest.fn(
      () =>
        new Promise<void>(resolve => {
          resolveDesignate = resolve;
        }),
    );

    loadTakes.mockImplementation((id: number) =>
      Promise.resolve(id === 42 ? [takeA] : [takeB]),
    );

    const { result, rerender } = renderHook(
      ({ bibleTextId }: { bibleTextId: number }) =>
        useVerseAudio({
          bibleTextId,
          loadTakes,
          persistTake,
          deleteTake,
          selectTake,
          designateCanonical,
        }),
      { initialProps: { bibleTextId: 42 } },
    );

    await waitFor(() => expect(result.current.takes).toEqual([takeA]));

    let setCanonicalPromise: Promise<void>;
    act(() => {
      setCanonicalPromise = result.current.setCanonical('rec_a');
    });

    // Navigate to verse B before the pending designate call resolves.
    rerender({ bibleTextId: 43 });

    await waitFor(() => expect(result.current.takes).toEqual([takeB]));

    await act(async () => {
      resolveDesignate();
      await setCanonicalPromise;
    });

    // Stale resolution for verse A must not clobber verse B's takes.
    expect(result.current.takes).toEqual([takeB]);
  });
});
