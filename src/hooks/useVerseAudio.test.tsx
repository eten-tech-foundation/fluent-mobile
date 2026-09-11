import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getConnectivitySnapshot } from '../services/connectivity';
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

jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
}));

jest.mock('../services/chapterClaimSync', () => ({
  syncChapterClaim: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  addRecordingTake: jest.fn(),
  deleteRecordingTake: jest.fn(),
  getTakesForVerse: jest.fn(),
  getAllTakesForVerse: jest.fn().mockResolvedValue([]),
  verseHasMultipleRecorders: jest.fn().mockResolvedValue(false),
  selectRecordingTake: jest.fn(),
  claimChapterOffline: jest.fn(),
}));

const mockGetConnectivitySnapshot = getConnectivitySnapshot as jest.Mock;

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
    granularity: 'verse',
    startChapter: 1,
    startVerse: 1,
    endChapter: 1,
    endVerse: 1,
    ...overrides,
  };
}

/** Synthetic aggregate row as `buildCrossGranularityRows` emits it (#411). */
function makeStitchedRow() {
  return {
    kind: 'stitched' as const,
    id: 'stitched:1:3-1:4',
    takeNumber: 1,
    startChapter: 1,
    startVerse: 3,
    endChapter: 1,
    endVerse: 4,
    durationMs: 2000,
    segments: [
      {
        takeId: 'v3',
        localFilePath: '/recordings/v3.m4a',
        chapterNumber: 1,
        verseNumber: 3,
        durationMs: 1000,
      },
      {
        takeId: 'v4',
        localFilePath: '/recordings/v4.m4a',
        chapterNumber: 1,
        verseNumber: 4,
        durationMs: 1000,
      },
    ],
  };
}

describe('useVerseAudio', () => {
  const loadTakes = jest.fn();
  const persistTake = jest.fn();
  const deleteTake = jest.fn();
  const selectTake = jest.fn();

  const verseAudioArgs = () => ({
    bibleTextId: 42,
    chapterAssignmentId: null,
    userId: null,
    loadTakes,
    persistTake,
    deleteTake,
    selectTake,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    playbackState.status = 'idle';
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
    });
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
    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => {
      expect(loadTakes).toHaveBeenCalledWith(42);
      expect(result.current.state).toBe('idle');
      expect(result.current.takes).toEqual([]);
    });
  });

  it('rehydrates to recorded when takes exist', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => {
      expect(result.current.state).toBe('recorded');
      expect(result.current.takes).toEqual([take]);
      expect(result.current.selectedTake?.id).toBe('rec_1');
    });
  });

  it('surfaces load failures as error state', async () => {
    loadTakes.mockRejectedValue(new Error('db down'));

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => {
      expect(result.current.state).toBe('error');
    });
  });

  it('starts recording and transitions idle → recording', async () => {
    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

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

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

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

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

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
      viewBibleTextId: 42,
      tempUri: 'file:///tmp/take.m4a',
      durationMs: 500,
      granularity: 'verse',
      startChapter: 0,
      startVerse: 0,
      endChapter: 0,
      endVerse: 0,
    });
    expect(result.current.state).toBe('recorded');
    expect(result.current.takes).toEqual([saved]);
  });

  it('plays a take when the file exists', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

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

  it('pausePlayback is a no-op when draft is not playing', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    mockPlaybackPause.mockClear();
    await act(async () => {
      await result.current.pausePlayback();
    });

    expect(mockPlaybackPause).not.toHaveBeenCalled();
    expect(result.current.state).toBe('recorded');
  });

  it('errors when playTake file is missing', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);
    mockFileExists.mockResolvedValue(false);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

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

  it('does not start recording when the visible take list is at the cap', async () => {
    loadTakes.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) =>
        makeTake({ id: `rec_${i + 1}`, takeNumber: i + 1 }),
      ),
    );

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.canRecordNewTake).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    expect(mockRecordingStart).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toMatch(/Maximum of 5 takes/);
  });

  it('treats a shared pericope take as filling the verse-mode cap', async () => {
    loadTakes.mockResolvedValue([
      ...Array.from({ length: 4 }, (_, i) =>
        makeTake({
          id: `verse_${i + 1}`,
          takeNumber: i + 1,
          granularity: 'verse',
          startVerse: 5,
          endVerse: 5,
        }),
      ),
      makeTake({
        id: 'peri',
        takeNumber: 1,
        granularity: 'pericope',
        bibleTextId: 103,
        startVerse: 3,
        endVerse: 7,
      }),
    ]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.canRecordNewTake).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    expect(mockRecordingStart).not.toHaveBeenCalled();
  });

  it('persists frozen capture metadata when recordingUnit clears before stop', async () => {
    mockRecordingStart.mockResolvedValue(undefined);
    mockRecordingStop.mockResolvedValue({
      uri: 'file:///tmp/take.m4a',
      durationMs: 2500,
    });
    loadTakes.mockResolvedValue([]);
    persistTake.mockResolvedValue({
      id: 'rec_new',
      localFilePath: '/recordings/rec_new.m4a',
    });

    const pericopeUnit = {
      granularity: 'pericope' as const,
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
      anchorBibleTextId: 103,
      coveredViews: [
        { bibleTextId: 103, chapterNumber: 1, verseNumber: 3 },
        { bibleTextId: 105, chapterNumber: 1, verseNumber: 5 },
      ],
    };

    const countTakesAtView = jest.fn().mockResolvedValue(0);

    const { result, rerender } = renderHook(
      (
        props: ReturnType<typeof verseAudioArgs> & {
          recordingUnit?: typeof pericopeUnit | null;
        },
      ) =>
        useVerseAudio({
          ...props,
          draftingUnit: 'pericope',
          chapterNumber: 1,
          verseNumber: 5,
          bibleTextId: 105,
          countTakesAtView,
          recordingUnit: props.recordingUnit ?? pericopeUnit,
        }),
      {
        initialProps: {
          ...verseAudioArgs(),
          recordingUnit: pericopeUnit,
        },
      },
    );

    await waitFor(() => expect(result.current.canRecordNewTake).toBe(true));

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      rerender({
        ...verseAudioArgs(),
        recordingUnit: null,
      });
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledWith({
      bibleTextId: 103,
      viewBibleTextId: 105,
      tempUri: 'file:///tmp/take.m4a',
      durationMs: 2500,
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });
  });

  it('blocks pericope capture when another spanned verse is already at the cap', async () => {
    const countTakesAtView = jest.fn(async (view: { verseNumber: number }) =>
      view.verseNumber === 7 ? 5 : 0,
    );
    loadTakes.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useVerseAudio({
        ...verseAudioArgs(),
        draftingUnit: 'pericope',
        chapterNumber: 1,
        verseNumber: 3,
        countTakesAtView,
        recordingUnit: {
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 3,
          endChapter: 1,
          endVerse: 7,
          anchorBibleTextId: 103,
          coveredViews: [
            { bibleTextId: 103, chapterNumber: 1, verseNumber: 3 },
            { bibleTextId: 107, chapterNumber: 1, verseNumber: 7 },
          ],
        },
      }),
    );

    await waitFor(() => expect(result.current.canRecordNewTake).toBe(false));

    await act(async () => {
      await result.current.start();
    });

    expect(mockRecordingStart).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toMatch(/Maximum of 5 takes/);
  });

  it('loads takes for every covered verse in pericope mode, without duplicates', async () => {
    const { getTakesForVerse } = jest.requireMock('../db/repository');
    const spanningTake = makeTake({
      id: 'pericope-take',
      granularity: 'pericope',
      startVerse: 3,
      endVerse: 4,
    });
    const verseTake = makeTake({ id: 'v4', startVerse: 4, endVerse: 4 });
    // The pericope take covers both verses, so both queries return it (#411).
    getTakesForVerse.mockImplementation((id: number) =>
      Promise.resolve(id === 103 ? [spanningTake] : [spanningTake, verseTake]),
    );

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 103,
        persistTake,
        deleteTake,
        selectTake,
        draftingUnit: 'pericope',
        chapterNumber: 1,
        verseNumber: 3,
        countTakesAtView: jest.fn().mockResolvedValue(0),
        recordingUnit: {
          granularity: 'pericope',
          startChapter: 1,
          startVerse: 3,
          endChapter: 1,
          endVerse: 4,
          anchorBibleTextId: 103,
          coveredViews: [
            { bibleTextId: 103, chapterNumber: 1, verseNumber: 3 },
            { bibleTextId: 104, chapterNumber: 1, verseNumber: 4 },
          ],
        },
      }),
    );

    await waitFor(() => expect(result.current.takes).toHaveLength(2));

    expect(getTakesForVerse).toHaveBeenCalledWith(103, undefined, {
      chapterNumber: 1,
      verseNumber: 3,
    });
    expect(getTakesForVerse).toHaveBeenCalledWith(104, undefined, {
      chapterNumber: 1,
      verseNumber: 4,
    });
    expect(result.current.takes.map(take => take.id)).toEqual([
      'pericope-take',
      'v4',
    ]);
  });

  it('plays stitched segments in order and ends after the last one', async () => {
    loadTakes.mockResolvedValue([makeTake()]);
    const stitchedRow = makeStitchedRow();

    const { result, rerender } = renderHook(() =>
      useVerseAudio(verseAudioArgs()),
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });

    expect(mockPlaybackPlay).toHaveBeenNthCalledWith(1, '/recordings/v3.m4a');
    expect(result.current.state).toBe('playing');
    expect(result.current.playingTakeId).toBe('stitched:1:3-1:4');
    // Not seekable: no single file backs a stitched row.
    expect(result.current.loadedTakeId).toBeNull();

    // Engine reports the end of segment 1 — the queue must advance, not end.
    playbackState.status = 'idle';
    await act(async () => {
      rerender(undefined);
    });

    expect(mockPlaybackPlay).toHaveBeenNthCalledWith(2, '/recordings/v4.m4a');
    expect(result.current.state).toBe('playing');

    // End of the last segment ends playback.
    playbackState.status = 'idle';
    await act(async () => {
      rerender(undefined);
    });

    expect(mockPlaybackPlay).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('recorded');
    expect(result.current.playingTakeId).toBeNull();
  });

  it('preserves the stitched queue on pause and resumes the current segment', async () => {
    loadTakes.mockResolvedValue([makeTake()]);
    const stitchedRow = makeStitchedRow();

    const { result, rerender } = renderHook(() =>
      useVerseAudio(verseAudioArgs()),
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });
    await act(async () => {
      await result.current.pausePlayback();
    });

    expect(mockPlaybackPause).toHaveBeenCalled();
    expect(result.current.state).toBe('recorded');
    expect(result.current.playingTakeId).toBe('stitched:1:3-1:4');

    // Idle while paused must not auto-advance to the next segment.
    playbackState.status = 'idle';
    await act(async () => {
      rerender(undefined);
    });
    expect(mockPlaybackPlay).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });
    expect(mockPlaybackPlay).toHaveBeenNthCalledWith(2, '/recordings/v3.m4a');
    expect(result.current.state).toBe('playing');
  });

  it('resumes the second stitched segment after pause mid-playback', async () => {
    loadTakes.mockResolvedValue([makeTake()]);
    const stitchedRow = makeStitchedRow();

    const { result, rerender } = renderHook(() =>
      useVerseAudio(verseAudioArgs()),
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });
    playbackState.status = 'idle';
    await act(async () => {
      rerender(undefined);
    });
    expect(mockPlaybackPlay).toHaveBeenNthCalledWith(2, '/recordings/v4.m4a');

    await act(async () => {
      await result.current.pausePlayback();
    });
    expect(result.current.playingTakeId).toBe('stitched:1:3-1:4');

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });
    expect(mockPlaybackPlay).toHaveBeenNthCalledWith(3, '/recordings/v4.m4a');
    expect(mockPlaybackPlay).toHaveBeenCalledTimes(3);
  });

  it('abandons the stitched queue when recording starts', async () => {
    loadTakes.mockResolvedValue([makeTake()]);
    const stitchedRow = makeStitchedRow();

    const { result, rerender } = renderHook(() =>
      useVerseAudio(verseAudioArgs()),
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });
    await act(async () => {
      await result.current.start();
    });

    expect(mockRecordingStart).toHaveBeenCalled();

    playbackState.status = 'idle';
    await act(async () => {
      rerender(undefined);
    });

    expect(mockPlaybackPlay).toHaveBeenCalledTimes(1);
  });

  it('does not enter playing when recording starts during an in-flight stitched load', async () => {
    loadTakes.mockResolvedValue([makeTake()]);
    const stitchedRow = makeStitchedRow();
    let resolvePlay!: () => void;
    const playBlocked = new Promise<void>(resolve => {
      resolvePlay = resolve;
    });
    mockPlaybackPlay.mockImplementation(async () => {
      await playBlocked;
    });

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    let playPromise!: Promise<void>;
    await act(async () => {
      playPromise = result.current.playStitched(stitchedRow);
    });

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      resolvePlay();
      await playPromise;
    });

    expect(mockRecordingStart).toHaveBeenCalled();
    expect(result.current.state).toBe('recording');
    expect(result.current.playingTakeId).toBeNull();
  });

  it('abandons the stitched queue when a take is deleted', async () => {
    loadTakes.mockResolvedValue([makeTake()]);
    deleteTake.mockResolvedValue(undefined);
    const stitchedRow = makeStitchedRow();

    const { result, rerender } = renderHook(() =>
      useVerseAudio(verseAudioArgs()),
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });
    await act(async () => {
      await result.current.deleteTake('rec_1');
    });

    expect(deleteTake).toHaveBeenCalledWith('rec_1');

    playbackState.status = 'idle';
    await act(async () => {
      rerender(undefined);
    });

    expect(mockPlaybackPlay).toHaveBeenCalledTimes(1);
  });

  it('drops the stitched queue when the active verse changes', async () => {
    loadTakes.mockResolvedValue([makeTake()]);
    const stitchedRow = makeStitchedRow();

    const { result, rerender } = renderHook(
      ({ bibleTextId }: { bibleTextId: number }) =>
        useVerseAudio({
          bibleTextId,
          loadTakes,
          persistTake,
          deleteTake,
          selectTake,
        }),
      { initialProps: { bibleTextId: 42 } },
    );

    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playStitched(stitchedRow);
    });
    expect(mockPlaybackPlay).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ bibleTextId: 43 });
    });

    playbackState.status = 'idle';
    await act(async () => {
      rerender({ bibleTextId: 43 });
    });

    expect(mockPlaybackPlay).toHaveBeenCalledTimes(1);
  });

  it('does not reload takes or stop playback when the capture unit is re-resolved unchanged', async () => {
    const { getTakesForVerse } = jest.requireMock('../db/repository');
    getTakesForVerse.mockResolvedValue([makeTake()]);
    const countTakesAtView = jest.fn().mockResolvedValue(0);
    const makeUnit = () => ({
      granularity: 'pericope' as const,
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 4,
      anchorBibleTextId: 103,
      coveredViews: [
        { bibleTextId: 103, chapterNumber: 1, verseNumber: 3 },
        { bibleTextId: 104, chapterNumber: 1, verseNumber: 4 },
      ],
    });

    const { result, rerender } = renderHook(
      ({ recordingUnit }: { recordingUnit: ReturnType<typeof makeUnit> }) =>
        useVerseAudio({
          bibleTextId: 103,
          persistTake,
          deleteTake,
          selectTake,
          draftingUnit: 'pericope',
          chapterNumber: 1,
          verseNumber: 3,
          countTakesAtView,
          recordingUnit,
        }),
      { initialProps: { recordingUnit: makeUnit() } },
    );

    await waitFor(() => expect(result.current.takes).toHaveLength(1));
    const loadsBefore = getTakesForVerse.mock.calls.length;
    const stopsBefore = mockPlaybackStop.mock.calls.length;

    // A playback transition re-resolves the unit: same verses, new identity.
    await act(async () => {
      rerender({ recordingUnit: makeUnit() });
    });

    expect(getTakesForVerse.mock.calls).toHaveLength(loadsBefore);
    expect(mockPlaybackStop.mock.calls).toHaveLength(stopsBefore);
  });
});
