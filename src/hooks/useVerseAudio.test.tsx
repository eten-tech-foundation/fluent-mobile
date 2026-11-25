import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getConnectivitySnapshot } from '../services/connectivity';
import { emitUploadSessionEvent } from '../services/syncEvents';
import { emitRecordingDataChanged } from '../services/recordingDataEvents';
import { useVerseAudio } from './useVerseAudio';
import type { Recording } from '../types/db/types';
import { verseHasMultipleRecorders } from '../db/repository';

const mockRecordingStart = jest.fn();
const mockRecordingStop = jest.fn();
const mockRecordingPause = jest.fn();
const mockRecordingResume = jest.fn();
const mockPlaybackPlay = jest.fn();
const mockPlaybackResume = jest.fn();
const mockPlaybackStop = jest.fn();
const mockPlaybackPause = jest.fn();
const mockPlaybackLoad = jest.fn();
const mockPlaybackSeek = jest.fn();
const mockFileExists = jest.fn();
const mockFileSize = jest.fn();
const mockDeleteFile = jest.fn();
const mockPausedMarkers: unknown[] = [];
const mockListPausedTakes = jest.fn(() => mockPausedMarkers);
const mockUpsertPausedTake = jest.fn((marker: unknown) => {
  const key = (marker as { sessionKey: string }).sessionKey;
  const index = mockPausedMarkers.findIndex(
    m => (m as { sessionKey: string }).sessionKey === key,
  );
  if (index >= 0) {
    mockPausedMarkers[index] = marker;
  } else {
    mockPausedMarkers.push(marker);
  }
});
const mockRecordingState = {
  status: 'idle' as 'idle' | 'recording' | 'paused',
};
const mockClearPausedTake = jest.fn((sessionKey: string) => {
  const index = mockPausedMarkers.findIndex(
    m => (m as { sessionKey: string }).sessionKey === sessionKey,
  );
  if (index >= 0) {
    mockPausedMarkers.splice(index, 1);
  }
});
const mockNotifyPendingUploads = jest.fn();

const playbackState = { status: 'idle' as 'idle' | 'playing' | 'paused' };

jest.mock('./useRecordingEngine', () => ({
  useRecordingEngine: () => ({
    start: mockRecordingStart,
    stop: mockRecordingStop,
    pause: mockRecordingPause,
    resume: mockRecordingResume,
    get status() {
      return mockRecordingState.status;
    },
  }),
}));

jest.mock('./usePlaybackEngine', () => ({
  usePlaybackEngine: () => ({
    play: async (...args: unknown[]) => {
      playbackState.status = 'playing';
      return mockPlaybackPlay(...args);
    },
    resume: async (...args: unknown[]) => {
      playbackState.status = 'playing';
      return mockPlaybackResume(...args);
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

jest.mock('../services/pausedTakes', () => ({
  clearPausedTake: (sessionKey: string) => mockClearPausedTake(sessionKey),
  isPausedTakeOrphaned: (marker: {
    chapterAssignmentId?: number;
    verseNumber?: number;
  }) =>
    marker.chapterAssignmentId === undefined ||
    marker.verseNumber === undefined,
  listPausedTakes: () => mockListPausedTakes(),
  upsertPausedTake: (marker: unknown) => mockUpsertPausedTake(marker),
}));

jest.mock('../services/recordingTakeDeletion', () => ({
  deleteRecordingTakeWithUploadState: jest.fn(),
}));
jest.mock('../services/uploadOrchestrator', () => ({
  notifyPendingUploads: (...args: unknown[]) =>
    mockNotifyPendingUploads(...args),
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
  findOfficialAtOtherAnchor: jest.fn().mockResolvedValue(null),
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
      connectionType: 'wifi',
    });
    loadTakes.mockResolvedValue([]);
    persistTake.mockResolvedValue({
      id: 'rec_new',
      localFilePath: '/recordings/rec_new.m4a',
    });
    deleteTake.mockResolvedValue(undefined);
    selectTake.mockResolvedValue(undefined);
    mockRecordingState.status = 'idle';
    mockRecordingStart.mockImplementation(async () => {
      mockRecordingState.status = 'recording';
    });
    mockRecordingStop.mockImplementation(async () => {
      mockRecordingState.status = 'idle';
      return { uri: 'file:///tmp/take.m4a', durationMs: 500 };
    });
    mockRecordingPause.mockImplementation(async () => {
      mockRecordingState.status = 'paused';
      return { uri: 'file:///tmp/take.aac', durationMs: 500 };
    });
    mockPlaybackResume.mockResolvedValue(undefined);
    mockRecordingResume.mockResolvedValue(undefined);
    mockPlaybackPlay.mockResolvedValue(undefined);
    mockPlaybackStop.mockResolvedValue(undefined);
    mockPlaybackPause.mockResolvedValue(undefined);
    mockPlaybackLoad.mockResolvedValue(undefined);
    mockPlaybackSeek.mockResolvedValue(undefined);
    mockFileExists.mockResolvedValue(true);
    mockFileSize.mockResolvedValue(128);
    mockDeleteFile.mockResolvedValue(undefined);
    mockPausedMarkers.splice(0, mockPausedMarkers.length);
  });

  it('checks other recorders in the current milestone, including after switching units', async () => {
    const check = jest.mocked(verseHasMultipleRecorders);
    check.mockImplementation(
      async (_id, _user, _view, unitId) => unitId === 580,
    );
    const { result, rerender } = renderHook(
      ({ projectUnitId }: { projectUnitId: number }) =>
        useVerseAudio({
          ...verseAudioArgs(),
          chapterNumber: 1,
          verseNumber: 1,
          projectUnitId,
        }),
      { initialProps: { projectUnitId: 579 } },
    );

    await waitFor(() => {
      expect(check).toHaveBeenCalledWith(
        42,
        undefined,
        { chapterNumber: 1, verseNumber: 1 },
        579,
      );
      expect(result.current.hasMultipleRecorders).toBe(false);
    });
    rerender({ projectUnitId: 580 });
    await waitFor(() => expect(result.current.hasMultipleRecorders).toBe(true));
    expect(check).toHaveBeenLastCalledWith(
      42,
      undefined,
      { chapterNumber: 1, verseNumber: 1 },
      580,
    );
    rerender({ projectUnitId: 579 });
    await waitFor(() =>
      expect(result.current.hasMultipleRecorders).toBe(false),
    );
    check.mockResolvedValue(false);
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

  describe('takesLoaded (#979)', () => {
    it('is false until the verse takes have loaded, then true', async () => {
      let release!: (takes: Recording[]) => void;
      loadTakes.mockImplementationOnce(
        () =>
          new Promise<Recording[]>(resolve => {
            release = resolve;
          }),
      );

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => {
        release([makeTake()]);
      });

      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      expect(result.current.takes).toHaveLength(1);
    });

    it('stays false after failure and retries until the take list loads', async () => {
      loadTakes
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce([makeTake()]);

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

      await waitFor(() => expect(result.current.state).toBe('error'));
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => result.current.retryTakesLoad());
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      expect(result.current.takes).toHaveLength(1);
    });

    it('is true again once a delete reloads the list after a failed reload', async () => {
      loadTakes
        .mockResolvedValueOnce([makeTake({ id: 'rec_1' })])
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue([]);

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));

      // A reload fails and leaves the earlier list on screen, unready.
      await act(async () => result.current.retryTakesLoad());
      await waitFor(() => expect(result.current.state).toBe('error'));
      expect(result.current.takesLoaded).toBe(false);
      expect(result.current.takes).toHaveLength(1);

      await act(async () => {
        await result.current.deleteTake('rec_1');
      });

      // The delete's own reload leaves `error` and retries the load, so Record
      // must not stay off with nothing to retry.
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      expect(result.current.state).toBe('idle');
      expect(result.current.takes).toEqual([]);
    });

    it('is true when there is no verse to load', async () => {
      const { result } = renderHook(() =>
        useVerseAudio({ ...verseAudioArgs(), bibleTextId: null }),
      );

      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      expect(loadTakes).not.toHaveBeenCalled();
    });

    it('resets to false while the next verse loads, then true again', async () => {
      const { result, rerender } = renderHook(
        ({ bibleTextId }: { bibleTextId: number }) =>
          useVerseAudio({ ...verseAudioArgs(), bibleTextId }),
        { initialProps: { bibleTextId: 42 } },
      );
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));

      let release!: (takes: Recording[]) => void;
      loadTakes.mockImplementationOnce(
        () =>
          new Promise<Recording[]>(resolve => {
            release = resolve;
          }),
      );
      await act(async () => {
        rerender({ bibleTextId: 43 });
      });
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => {
        release([]);
      });
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
    });

    it('resets synchronously when the resolved pericope changes the takes query', async () => {
      const pericopeUnit = {
        granularity: 'pericope' as const,
        startChapter: 1,
        startVerse: 1,
        endChapter: 1,
        endVerse: 2,
        anchorBibleTextId: 42,
        coveredViews: [
          { bibleTextId: 42, chapterNumber: 1, verseNumber: 1 },
          { bibleTextId: 43, chapterNumber: 1, verseNumber: 2 },
        ],
      };
      loadTakes.mockResolvedValueOnce([]);
      const countTakesAtView = jest.fn().mockResolvedValue(0);
      // Every render's view of readiness, so the first render with the
      // pericope unit can be checked before any effect has run.
      const renders: { hasUnit: boolean; takesLoaded: boolean }[] = [];
      const { result, rerender } = renderHook(
        ({ recordingUnit }: { recordingUnit: typeof pericopeUnit | null }) => {
          const audio = useVerseAudio({
            ...verseAudioArgs(),
            chapterNumber: 1,
            verseNumber: 1,
            draftingUnit: 'pericope',
            recordingUnit,
            countTakesAtView,
          });
          renders.push({
            hasUnit: recordingUnit !== null,
            takesLoaded: audio.takesLoaded,
          });
          return audio;
        },
        { initialProps: { recordingUnit: null } },
      );
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));

      let release!: (takes: Recording[]) => void;
      loadTakes.mockImplementationOnce(
        () => new Promise<Recording[]>(resolve => (release = resolve)),
      );
      const rendersBefore = renders.length;
      await act(async () => rerender({ recordingUnit: pericopeUnit }));
      // The very first render with the pericope unit must already read
      // unready, not only after effects have flushed.
      expect(renders[rendersBefore]).toEqual({
        hasUnit: true,
        takesLoaded: false,
      });
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => release([]));
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
    });

    it('ignores a stale load finishing after the verse changed', async () => {
      let releaseOld!: (takes: Recording[]) => void;
      loadTakes.mockImplementationOnce(
        () =>
          new Promise<Recording[]>(resolve => {
            releaseOld = resolve;
          }),
      );
      const { result, rerender } = renderHook(
        ({ bibleTextId }: { bibleTextId: number }) =>
          useVerseAudio({ ...verseAudioArgs(), bibleTextId }),
        { initialProps: { bibleTextId: 42 } },
      );

      let releaseNew!: (takes: Recording[]) => void;
      loadTakes.mockImplementationOnce(
        () =>
          new Promise<Recording[]>(resolve => {
            releaseNew = resolve;
          }),
      );
      await act(async () => {
        rerender({ bibleTextId: 43 });
      });

      // The old verse's load lands late. It must not mark the new verse loaded.
      await act(async () => {
        releaseOld([makeTake()]);
      });
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => {
        releaseNew([]);
      });
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
    });

    it('is false when returning to a verse whose reload is still pending', async () => {
      const { result, rerender } = renderHook(
        ({ bibleTextId }: { bibleTextId: number }) =>
          useVerseAudio({ ...verseAudioArgs(), bibleTextId }),
        { initialProps: { bibleTextId: 42 } },
      );
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));

      // B's load never finishes, so we leave it before it does.
      loadTakes.mockImplementationOnce(
        () => new Promise<Recording[]>(() => {}),
      );
      await act(async () => {
        rerender({ bibleTextId: 43 });
      });

      let releaseA!: (takes: Recording[]) => void;
      loadTakes.mockImplementationOnce(
        () =>
          new Promise<Recording[]>(resolve => {
            releaseA = resolve;
          }),
      );
      await act(async () => {
        rerender({ bibleTextId: 42 });
      });

      // Same key as the first load, but that load is old: not ready yet.
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => {
        releaseA([makeTake({ id: 'rec_new' })]);
      });
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      expect(result.current.takes.map(t => t.id)).toEqual(['rec_new']);
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
      projectUnitId: null,
      tempUri: 'file:///tmp/take.m4a',
      tempUris: ['file:///tmp/take.m4a'],
      durationMs: 500,
      granularity: 'verse',
      startChapter: 0,
      startVerse: 0,
      endChapter: 0,
      endVerse: 0,
    });
    expect(mockNotifyPendingUploads).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('recorded');
    expect(result.current.takes).toEqual([saved]);
  });

  it('queues an upload pass after a selection change (#701)', async () => {
    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.selectTake('rec_1');
    });

    expect(selectTake).toHaveBeenCalledWith('rec_1');
    expect(mockNotifyPendingUploads).toHaveBeenCalledTimes(1);
  });

  it('re-choosing a selected take whose upload failed is an explicit reactivation (#886)', async () => {
    const reassertTake = jest.fn().mockResolvedValue(true);
    loadTakes.mockResolvedValue([
      makeTake({ isSelected: true, syncStatus: 'failed' }),
      makeTake({ id: 'rec_2', isSelected: false, syncStatus: 'failed' }),
    ]);
    const { result } = renderHook(() =>
      useVerseAudio({ ...verseAudioArgs(), reassertTake }),
    );
    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.selectTake('rec_1');
    });
    expect(reassertTake).toHaveBeenCalledWith('rec_1');
    expect(selectTake).not.toHaveBeenCalled();
    expect(mockNotifyPendingUploads).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.selectTake('rec_2');
    });
    expect(selectTake).toHaveBeenCalledWith('rec_2');
    expect(reassertTake).toHaveBeenCalledTimes(1);
  });

  it('queues an upload pass after a canonical designation (#701)', async () => {
    const designateCanonical = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useVerseAudio({ ...verseAudioArgs(), designateCanonical }),
    );
    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.setCanonical('rec_1');
    });

    expect(designateCanonical).toHaveBeenCalledWith('rec_1');
    expect(mockNotifyPendingUploads).toHaveBeenCalledTimes(1);
  });

  describe('official takes at another anchor (#896)', () => {
    const designateCanonical = jest.fn();
    const reassertTake = jest.fn();
    const onReplacementBlocked = jest.fn();
    const findOfficialAtOtherAnchor = jest.fn();

    function renderGuarded() {
      return renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs(),
          designateCanonical,
          reassertTake,
          onReplacementBlocked,
          findOfficialAtOtherAnchor,
        }),
      );
    }

    beforeEach(() => {
      designateCanonical.mockResolvedValue(undefined);
      reassertTake.mockResolvedValue(true);
      loadTakes.mockResolvedValue([
        makeTake({ isSelected: true, syncStatus: 'failed' }),
        makeTake({ id: 'rec_2' }),
      ]);
      findOfficialAtOtherAnchor.mockResolvedValue(
        makeTake({ id: 'official_passage', granularity: 'pericope' }),
      );
    });

    it('refuses to select, reactivate or designate, and explains once per try', async () => {
      const { result } = renderGuarded();
      await waitFor(() => expect(result.current.state).toBe('recorded'));
      loadTakes.mockClear();

      const applied: boolean[] = [];
      await act(async () => {
        applied.push(await result.current.selectTake('rec_2'));
        applied.push(await result.current.selectTake('rec_1'));
        applied.push(await result.current.setCanonical('rec_2'));
      });

      expect(applied).toEqual([false, false, false]);
      expect(findOfficialAtOtherAnchor).toHaveBeenCalledWith('rec_2');
      expect(onReplacementBlocked).toHaveBeenCalledTimes(3);
      expect(selectTake).not.toHaveBeenCalled();
      expect(reassertTake).not.toHaveBeenCalled();
      expect(designateCanonical).not.toHaveBeenCalled();
      expect(mockNotifyPendingUploads).not.toHaveBeenCalled();
      expect(loadTakes).not.toHaveBeenCalled();
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.takes.map(t => t.id)).toEqual(['rec_1', 'rec_2']);
    });

    it('lets same-anchor choices through', async () => {
      findOfficialAtOtherAnchor.mockResolvedValue(null);
      const { result } = renderGuarded();
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      const applied: boolean[] = [];
      await act(async () => {
        applied.push(await result.current.selectTake('rec_2'));
        applied.push(await result.current.setCanonical('rec_2'));
      });

      expect(applied).toEqual([true, true]);
      expect(selectTake).toHaveBeenCalledWith('rec_2');
      expect(designateCanonical).toHaveBeenCalledWith('rec_2');
      expect(mockNotifyPendingUploads).toHaveBeenCalledTimes(2);
      expect(onReplacementBlocked).not.toHaveBeenCalled();
    });

    it('blocks and reports an error when the overlap check fails', async () => {
      findOfficialAtOtherAnchor.mockRejectedValue(new Error('db closed'));
      const { result } = renderGuarded();
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      let applied = true;
      await act(async () => {
        applied = await result.current.setCanonical('rec_2');
      });

      expect(applied).toBe(false);
      expect(designateCanonical).not.toHaveBeenCalled();
      expect(mockNotifyPendingUploads).not.toHaveBeenCalled();
      expect(onReplacementBlocked).not.toHaveBeenCalled();
      expect(result.current.errorMessage).toBe('db closed');
    });

    it('trusts a check the caller just made', async () => {
      const { result } = renderGuarded();
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      let applied = false;
      await act(async () => {
        applied = await result.current.setCanonical('rec_2', {
          overlapChecked: true,
        });
      });

      expect(applied).toBe(true);
      expect(findOfficialAtOtherAnchor).not.toHaveBeenCalled();
      expect(designateCanonical).toHaveBeenCalledWith('rec_2');
    });

    it('answers the pre-check without writing anything', async () => {
      const { result } = renderGuarded();
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      let blocked = false;
      await act(async () => {
        blocked = await result.current.blockUnsupportedReplacement('rec_2');
      });

      expect(blocked).toBe(true);
      expect(onReplacementBlocked).toHaveBeenCalledTimes(1);
      expect(selectTake).not.toHaveBeenCalled();
      expect(designateCanonical).not.toHaveBeenCalled();
    });
  });

  it('queues an upload pass after a take is deleted (#701)', async () => {
    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.deleteTake('rec_1');
    });

    expect(deleteTake).toHaveBeenCalledWith('rec_1');
    expect(mockNotifyPendingUploads).toHaveBeenCalledTimes(1);
  });

  it('writes a paused-take marker, with its account, when recording is paused', async () => {
    const { result } = renderHook(() =>
      useVerseAudio({
        ...verseAudioArgs(),
        chapterAssignmentId: 7,
        chapterNumber: 1,
        verseNumber: 3,
        userId: 12,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.pause();
    });

    expect(mockUpsertPausedTake).toHaveBeenCalledWith({
      sessionKey: '7:3',
      segments: ['file:///tmp/take.aac'],
      elapsedMs: 500,
      startedAt: expect.any(String),
      chapterAssignmentId: 7,
      verseNumber: 3,
      capture: {
        bibleTextId: 42,
        granularity: 'verse',
        startChapter: 1,
        startVerse: 3,
        endChapter: 1,
        endVerse: 3,
      },
      userId: 12,
    });
    expect(result.current.state).toBe('paused');
  });

  const recoveredMarker = () => ({
    sessionKey: '7:3',
    segments: ['file:///old.aac'],
    elapsedMs: 1000,
    startedAt: '2026-10-05T10:00:00.000Z',
    chapterAssignmentId: 7,
    verseNumber: 3,
  });

  const recoveryArgs = () => ({
    ...verseAudioArgs(),
    chapterAssignmentId: 7,
    chapterNumber: 1,
    verseNumber: 3,
  });

  it('hydrates a recovered marker into paused without starting the recorder', async () => {
    mockPausedMarkers.push(recoveredMarker());

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));

    await waitFor(() => {
      expect(result.current.state).toBe('paused');
    });
    expect(result.current.recoveredElapsedMs).toBe(1000);
    expect(mockRecordingStart).not.toHaveBeenCalled();
  });

  it('keeps the take list unready until the paused-take check settles (#979)', async () => {
    mockPausedMarkers.push(recoveredMarker());
    let releaseFileCheck!: (exists: boolean) => void;
    mockFileExists.mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        releaseFileCheck = resolve;
      }),
    );

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(mockFileExists).toHaveBeenCalled());

    // The rows have loaded, but recovery has not been decided yet.
    expect(result.current.takesLoaded).toBe(false);
    await act(async () => {
      await result.current.start();
    });
    expect(mockRecordingStart).not.toHaveBeenCalled();

    await act(async () => {
      releaseFileCheck(true);
    });
    await waitFor(() => expect(result.current.state).toBe('paused'));
    expect(result.current.takesLoaded).toBe(true);
    expect(result.current.recoveredElapsedMs).toBe(1000);
  });

  it('lets go of a recovered take when the account changes, leaving it for its owner', async () => {
    mockPausedMarkers.push({ ...recoveredMarker(), userId: 12 });

    const { result, rerender } = renderHook(
      ({ userId }: { userId: number }) =>
        useVerseAudio({ ...recoveryArgs(), userId }),
      { initialProps: { userId: 12 } },
    );
    await waitFor(() => expect(result.current.state).toBe('paused'));

    rerender({ userId: 13 });
    await waitFor(() => expect(result.current.state).not.toBe('paused'));

    expect(result.current.recoveredElapsedMs).toBe(0);
    // Nothing of the first account's is saved, resumed, discarded or deleted.
    await act(async () => {
      await result.current.stop();
      await result.current.discardCapture();
    });
    expect(persistTake).not.toHaveBeenCalled();
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockPausedMarkers).toEqual([{ ...recoveredMarker(), userId: 12 }]);

    // And their own take comes back for them.
    rerender({ userId: 12 });
    await waitFor(() => expect(result.current.state).toBe('paused'));
    expect(result.current.recoveredElapsedMs).toBe(1000);
  });

  it('resumes a recovered take into a new segment and persists all segments on stop', async () => {
    const saved = makeTake({ id: 'rec_new', isSelected: true });
    mockPausedMarkers.push(recoveredMarker());
    loadTakes.mockResolvedValueOnce([]).mockResolvedValueOnce([saved]);

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));

    await waitFor(() => expect(result.current.state).toBe('paused'));

    await act(async () => {
      await result.current.resume();
    });

    // No native recorder exists yet, so resume starts a fresh segment.
    expect(mockRecordingStart).toHaveBeenCalledTimes(1);
    expect(mockRecordingResume).not.toHaveBeenCalled();
    expect(result.current.state).toBe('recording');

    await act(async () => {
      await result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({
        tempUri: 'file:///tmp/take.m4a',
        tempUris: ['file:///old.aac', 'file:///tmp/take.m4a'],
        durationMs: 1500,
      }),
    );
    expect(mockClearPausedTake).toHaveBeenCalledWith('7:3');
    expect(result.current.recoveredElapsedMs).toBe(0);
    expect(result.current.state).toBe('recorded');
  });

  it('stops straight from the recovered state and saves only the recovered audio', async () => {
    const saved = makeTake({ id: 'rec_new', isSelected: true });
    mockPausedMarkers.push(recoveredMarker());
    loadTakes.mockResolvedValueOnce([]).mockResolvedValueOnce([saved]);

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));

    await waitFor(() => expect(result.current.state).toBe('paused'));

    await act(async () => {
      await result.current.stop();
    });

    expect(mockRecordingStop).not.toHaveBeenCalled();
    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({
        tempUri: 'file:///old.aac',
        tempUris: ['file:///old.aac'],
        durationMs: 1000,
      }),
    );
    expect(mockClearPausedTake).toHaveBeenCalledWith('7:3');
    expect(result.current.state).toBe('recorded');
  });

  describe('a take that stops with no file (#979)', () => {
    const noFile = () =>
      mockRecordingStop.mockImplementation(async () => {
        mockRecordingState.status = 'idle';
        return null;
      });

    it('drops the take quietly: nothing saved, no error, back to idle', async () => {
      noFile();
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('idle'));

      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe('recording');
      await act(async () => {
        await result.current.stop();
      });

      expect(mockRecordingStop).toHaveBeenCalledTimes(1);
      expect(persistTake).not.toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.takes).toEqual([]);
    });

    it('goes back to review when the verse already has takes', async () => {
      noFile();
      loadTakes.mockResolvedValue([makeTake()]);
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe('recording');
      await act(async () => {
        await result.current.stop();
      });

      expect(mockRecordingStop).toHaveBeenCalledTimes(1);
      expect(persistTake).not.toHaveBeenCalled();
      expect(result.current.state).toBe('recorded');
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.takes).toHaveLength(1);
    });

    it('still saves the earlier segments when a resumed segment has no file', async () => {
      noFile();
      mockPausedMarkers.push(recoveredMarker());
      loadTakes.mockResolvedValueOnce([]).mockResolvedValueOnce([makeTake()]);
      const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
      await waitFor(() => expect(result.current.state).toBe('paused'));
      await act(async () => {
        await result.current.resume();
      });

      await act(async () => {
        await result.current.stop();
      });

      expect(mockRecordingStop).toHaveBeenCalledTimes(1);
      expect(persistTake).toHaveBeenCalledWith(
        expect.objectContaining({
          tempUri: 'file:///old.aac',
          tempUris: ['file:///old.aac'],
          durationMs: 1000,
        }),
      );
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.state).toBe('recorded');
    });

    it('discards without deleting a file that was never written', async () => {
      noFile();
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('idle'));
      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe('recording');

      await act(async () => {
        await result.current.discardCapture();
      });

      expect(mockRecordingStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
      expect(result.current.errorMessage).toBeNull();
    });

    it('restores review from the takes current when the stop completes', async () => {
      let finishStop!: () => void;
      mockRecordingStop.mockImplementation(
        () =>
          new Promise<null>(resolve => {
            finishStop = () => {
              mockRecordingState.status = 'idle';
              resolve(null);
            };
          }),
      );
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('idle'));
      await act(async () => {
        await result.current.start();
      });

      let stopping!: Promise<void>;
      act(() => {
        stopping = result.current.stop();
      });
      // A refresh adds a take while the recorder is still stopping.
      loadTakes.mockResolvedValue([makeTake()]);
      await act(async () => {
        emitRecordingDataChanged();
      });
      await waitFor(() => expect(result.current.takes).toHaveLength(1));

      await act(async () => {
        finishStop();
        await stopping;
      });

      expect(persistTake).not.toHaveBeenCalled();
      expect(result.current.state).toBe('recorded');
    });
  });

  describe('a Stop that is still settling (#979)', () => {
    /** Holds the native stop open, as the minimum-run hold does. */
    const deferredStop = () => {
      let finish!: () => void;
      mockRecordingStop.mockImplementation(
        () =>
          new Promise<{ uri: string; durationMs: number }>(resolve => {
            finish = () => {
              mockRecordingState.status = 'idle';
              resolve({ uri: 'file:///tmp/take.m4a', durationMs: 500 });
            };
          }),
      );
      return () => finish();
    };

    it('keeps the old verse rows out of the new view when Stop, Next and Discard overlap', async () => {
      const oldRow = makeTake({ id: 'rec_old', bibleTextId: 42 });
      const newRow = makeTake({ id: 'rec_next_verse', bibleTextId: 43 });
      loadTakes.mockImplementation(async (id: number) =>
        id === 42 ? [] : [newRow],
      );
      const finishStop = deferredStop();
      const { result, rerender } = renderHook(
        ({ id }: { id: number }) =>
          useVerseAudio({ ...verseAudioArgs(), bibleTextId: id }),
        { initialProps: { id: 42 } },
      );
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe('recording');

      let stopping!: Promise<void>;
      act(() => {
        stopping = result.current.stop();
      });
      // Pending from the press, before the reducer has left `recording`.
      expect(result.current.isStopPending()).toBe(true);
      expect(result.current.state).toBe('recording');

      // Discard from the leave prompt must not resolve, and so must not let a
      // navigation continue, while Stop is still pending.
      let discardSettled = false;
      let discarding!: Promise<void>;
      act(() => {
        discarding = result.current.discardCapture().then(() => {
          discardSettled = true;
        });
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(discardSettled).toBe(false);
      expect(mockRecordingStop).toHaveBeenCalledTimes(1);

      // The view moves on while Stop is still pending.
      rerender({ id: 43 });
      await waitFor(() => expect(result.current.takes).toEqual([newRow]));
      // Once saved, the old verse's own read returns its new take.
      loadTakes.mockImplementation(async (id: number) =>
        id === 42 ? [oldRow] : [newRow],
      );

      await act(async () => {
        finishStop();
        await stopping;
        await discarding;
      });

      expect(persistTake).toHaveBeenCalledTimes(1);
      expect(persistTake).toHaveBeenCalledWith(
        expect.objectContaining({ viewBibleTextId: 42 }),
      );
      expect(discardSettled).toBe(true);
      // The new view keeps its own rows, and is not left in `saving`.
      expect(result.current.takes).toEqual([newRow]);
      expect(result.current.state).toBe('recorded');
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.isStopPending()).toBe(false);
    });

    it('joins a second Stop and a Discard onto the Stop in flight', async () => {
      const finishStop = deferredStop();
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      await act(async () => {
        await result.current.start();
      });

      let first!: Promise<void>;
      let second!: Promise<void>;
      let discarding!: Promise<void>;
      act(() => {
        first = result.current.stop();
        second = result.current.stop();
        discarding = result.current.discardCapture();
      });
      await act(async () => {
        finishStop();
        await Promise.all([first, second, discarding]);
      });

      expect(mockRecordingStop).toHaveBeenCalledTimes(1);
      expect(persistTake).toHaveBeenCalledTimes(1);
      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(result.current.state).toBe('recorded');
      expect(result.current.isStopPending()).toBe(false);
    });
  });

  it('does not publish a delete reload once the verse has changed', async () => {
    const takeA = makeTake({ id: 'rec_a' });
    const takeB = makeTake({ id: 'rec_b' });
    loadTakes.mockImplementation(async (id: number) =>
      id === 42 ? [takeA] : [takeB],
    );
    let finishDelete!: () => void;
    deleteTake.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishDelete = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useVerseAudio({ ...verseAudioArgs(), bibleTextId: id }),
      { initialProps: { id: 42 } },
    );
    await waitFor(() => expect(result.current.takesLoaded).toBe(true));

    let deleting!: Promise<void>;
    act(() => {
      deleting = result.current.deleteTake('rec_a');
    });
    rerender({ id: 43 });
    await waitFor(() => expect(result.current.takes).toEqual([takeB]));
    expect(result.current.takesLoaded).toBe(true);

    // The delete's reload for the old verse must not replace the new verse's rows.
    loadTakes.mockImplementation(async (id: number) =>
      id === 42 ? [] : [takeB],
    );
    await act(async () => {
      finishDelete();
      await deleting;
    });

    expect(deleteTake).toHaveBeenCalledWith('rec_a');
    expect(result.current.takes).toEqual([takeB]);
    expect(result.current.takesLoaded).toBe(true);
  });

  describe('a delete reload is bound to its own query (#979)', () => {
    const takeA = makeTake({ id: 'rec_a' });
    const takeB = makeTake({ id: 'rec_b' });
    const withOwner = (take: Recording) => ({
      ...take,
      ownerDisplayName: 'Recorder',
    });

    it('ignores a retained callback from a verse that is no longer active', async () => {
      loadTakes.mockImplementation(async (id: number) =>
        id === 42 ? [takeA] : [takeB],
      );
      const { result, rerender } = renderHook(
        ({ id }: { id: number }) =>
          useVerseAudio({ ...verseAudioArgs(), bibleTextId: id }),
        { initialProps: { id: 42 } },
      );
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      // A confirmation alert keeps this callback past the verse change.
      const retained = result.current.deleteTake;

      rerender({ id: 43 });
      await waitFor(() => expect(result.current.takes).toEqual([takeB]));

      loadTakes.mockImplementation(async (id: number) =>
        id === 42 ? [] : [takeB],
      );
      await act(async () => {
        await retained('rec_a');
      });

      expect(deleteTake).toHaveBeenCalledWith('rec_a');
      expect(result.current.takes).toEqual([takeB]);
      expect(result.current.takesLoaded).toBe(true);
    });

    it('does not publish an All Takes refresh that was in flight when the verse changed', async () => {
      let releaseOldAllTakes!: (rows: ReturnType<typeof withOwner>[]) => void;
      const loadAllTakes = jest.fn(async () => [withOwner(takeA)]);
      loadTakes.mockResolvedValue([takeA]);
      const { result, rerender } = renderHook(
        ({ id }: { id: number }) =>
          useVerseAudio({ ...verseAudioArgs(), bibleTextId: id, loadAllTakes }),
        { initialProps: { id: 42 } },
      );
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));

      // The delete's own All Takes refresh for the old verse stays pending.
      loadAllTakes.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseOldAllTakes = resolve;
          }),
      );
      let deleting!: Promise<void>;
      act(() => {
        deleting = result.current.deleteTake('rec_a');
      });
      await waitFor(() => expect(releaseOldAllTakes).toBeDefined());

      // The new verse's own load has not started its refresh yet.
      loadTakes.mockImplementationOnce(
        () => new Promise<Recording[]>(() => {}),
      );
      await act(async () => {
        rerender({ id: 43 });
      });

      await act(async () => {
        releaseOldAllTakes([withOwner(makeTake({ id: 'rec_stale' }))]);
        await deleting;
      });

      expect(result.current.allTakes.map(t => t.id)).not.toContain('rec_stale');
    });

    it('does not mark a verse ready for a delete that began before A -> B -> A', async () => {
      loadTakes.mockResolvedValue([takeA]);
      let finishDelete!: () => void;
      deleteTake.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finishDelete = resolve;
          }),
      );
      const { result, rerender } = renderHook(
        ({ id }: { id: number }) =>
          useVerseAudio({ ...verseAudioArgs(), bibleTextId: id }),
        { initialProps: { id: 42 } },
      );
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));

      let deleting!: Promise<void>;
      act(() => {
        deleting = result.current.deleteTake('rec_a');
      });

      loadTakes.mockImplementationOnce(
        () => new Promise<Recording[]>(() => {}),
      );
      await act(async () => {
        rerender({ id: 43 });
      });
      let releaseA!: (takes: Recording[]) => void;
      loadTakes.mockImplementationOnce(
        () =>
          new Promise<Recording[]>(resolve => {
            releaseA = resolve;
          }),
      );
      await act(async () => {
        rerender({ id: 42 });
      });
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => {
        finishDelete();
        await deleting;
      });

      // The old delete shares A's key but not A's current load.
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => {
        releaseA([takeA]);
      });
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
    });

    it('keeps Record off after a delete when the paused-take check failed, and retries recovery', async () => {
      mockPausedMarkers.push(recoveredMarker());
      loadTakes.mockResolvedValue([takeA]);
      mockFileExists.mockRejectedValueOnce(new Error('fs down'));

      const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
      await waitFor(() => expect(result.current.state).toBe('error'));
      expect(result.current.takesLoaded).toBe(false);

      loadTakes.mockResolvedValue([]);
      let releaseRetry!: (exists: boolean) => void;
      mockFileExists.mockReturnValueOnce(
        new Promise<boolean>(resolve => {
          releaseRetry = resolve;
        }),
      );
      await act(async () => {
        await result.current.deleteTake('rec_a');
      });

      // Recovery is retried but has not finished: recording stays blocked.
      await waitFor(() => expect(mockFileExists).toHaveBeenCalledTimes(2));
      expect(result.current.takesLoaded).toBe(false);
      await act(async () => {
        await result.current.start();
      });
      expect(mockRecordingStart).not.toHaveBeenCalled();

      await act(async () => {
        releaseRetry(true);
      });
      await waitFor(() => expect(result.current.state).toBe('paused'));
      expect(result.current.takesLoaded).toBe(true);
    });

    it('retries recovery when the paused-take check fails while the delete is still refreshing', async () => {
      mockPausedMarkers.push(recoveredMarker());
      loadTakes.mockResolvedValueOnce([takeA]).mockResolvedValue([]);
      const loadAllTakes = jest.fn(async () => [withOwner(takeA)]);
      let rejectFileCheck!: (error: Error) => void;
      mockFileExists.mockReturnValueOnce(
        new Promise<boolean>((_resolve, reject) => {
          rejectFileCheck = reject;
        }),
      );

      const { result } = renderHook(() =>
        useVerseAudio({ ...recoveryArgs(), loadAllTakes }),
      );
      await waitFor(() => expect(mockFileExists).toHaveBeenCalled());

      // The delete's All Takes refresh stays pending.
      let releaseRefresh!: (rows: ReturnType<typeof withOwner>[]) => void;
      loadAllTakes.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseRefresh = resolve;
          }),
      );
      let deleting!: Promise<void>;
      act(() => {
        deleting = result.current.deleteTake('rec_a');
      });
      await waitFor(() => expect(releaseRefresh).toBeDefined());

      // The check fails only now, after the delete looked at the load state.
      await act(async () => {
        rejectFileCheck(new Error('fs down'));
      });
      await waitFor(() => expect(result.current.state).toBe('error'));

      await act(async () => {
        releaseRefresh([]);
        await deleting;
      });

      // The delete leaves `error`, so it must retry rather than strand Record.
      await waitFor(() => expect(result.current.takesLoaded).toBe(true));
      expect(mockFileExists).toHaveBeenCalledTimes(2);
    });

    it('keeps Record off after a delete while the paused-take check is pending', async () => {
      mockPausedMarkers.push(recoveredMarker());
      loadTakes.mockResolvedValueOnce([takeA]).mockResolvedValue([]);
      let releaseFileCheck!: (exists: boolean) => void;
      mockFileExists.mockReturnValueOnce(
        new Promise<boolean>(resolve => {
          releaseFileCheck = resolve;
        }),
      );

      const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
      await waitFor(() => expect(mockFileExists).toHaveBeenCalled());
      expect(result.current.takesLoaded).toBe(false);

      await act(async () => {
        await result.current.deleteTake('rec_a');
      });

      // The delete reloaded the rows, but recovery has not restored its refs.
      expect(result.current.takesLoaded).toBe(false);
      await act(async () => {
        await result.current.start();
      });
      expect(mockRecordingStart).not.toHaveBeenCalled();

      await act(async () => {
        releaseFileCheck(true);
      });
      await waitFor(() => expect(result.current.state).toBe('paused'));
      expect(result.current.takesLoaded).toBe(true);
    });
  });

  it('cleans up a marker whose segment files are gone instead of pausing', async () => {
    mockPausedMarkers.push(recoveredMarker());
    mockFileExists.mockResolvedValue(false);

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));

    await waitFor(() => {
      expect(mockClearPausedTake).toHaveBeenCalledWith('7:3');
    });
    expect(mockDeleteFile).toHaveBeenCalledWith('file:///old.aac');
    expect(result.current.state).toBe('idle');
    expect(result.current.recoveredElapsedMs).toBe(0);
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

  it("won't start the mic again while the last take is saving", async () => {
    const uri = 'file:///tmp/take.aac';
    mockRecordingStop.mockImplementation(async () => {
      mockRecordingState.status = 'idle';
      return { uri, durationMs: 900 };
    });
    persistTake.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('idle'));
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      void result.current.stop();
    });
    await waitFor(() => expect(result.current.state).toBe('saving'));
    mockRecordingStart.mockClear();

    await act(async () => {
      await result.current.start();
    });

    expect(mockRecordingStart).not.toHaveBeenCalled();
  });

  it('keeps playing one take while another is deleted', async () => {
    const take = makeTake();
    const other = makeTake({
      id: 'rec_2',
      takeNumber: 2,
      isSelected: false,
      localFilePath: '/recordings/rec_2.m4a',
    });
    loadTakes.mockResolvedValue([take, other]);
    deleteTake.mockResolvedValue(undefined);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));
    await act(async () => {
      await result.current.playTake(take);
    });
    loadTakes.mockResolvedValue([take]);
    await act(async () => {
      await result.current.deleteTake('rec_2');
    });

    expect(deleteTake).toHaveBeenCalledWith('rec_2');
    expect(result.current.state).toBe('playing');
    expect(result.current.playingTakeId).toBe('rec_1');
  });

  it('still deletes the playing take when the player is already released', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));
    await act(async () => {
      await result.current.playTake(take);
    });
    mockPlaybackStop.mockRejectedValue(new Error('player released'));
    loadTakes.mockResolvedValue([]);
    await act(async () => {
      await result.current.deleteTake('rec_1');
    });

    expect(deleteTake).toHaveBeenCalledWith('rec_1');
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.playingTakeId).toBeNull();
    expect(result.current.state).toBe('idle');
  });

  it('plays a take from a start position', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));
    await act(async () => {
      await result.current.playTake(take, 400);
    });

    expect(mockPlaybackResume).toHaveBeenCalledWith(400, take.localFilePath);
    expect(mockPlaybackPlay).not.toHaveBeenCalled();
    expect(result.current.state).toBe('playing');
    expect(result.current.playingTakeId).toBe('rec_1');
  });

  it('plays from the top when the start position is 0', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));
    await act(async () => {
      await result.current.playTake(take, 0);
    });

    expect(mockPlaybackResume).toHaveBeenCalledWith(0, take.localFilePath);
    expect(mockPlaybackPlay).not.toHaveBeenCalled();
  });

  it("won't play an empty take from a start position", async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);
    mockFileSize.mockResolvedValue(0);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));
    await act(async () => {
      await result.current.playTake(take, 400);
    });

    expect(mockPlaybackResume).not.toHaveBeenCalled();
    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toMatch(/empty/i);
  });

  it('seeks the take it is given over the selected one', async () => {
    const take = makeTake();
    const other = makeTake({
      id: 'rec_2',
      takeNumber: 2,
      isSelected: false,
      localFilePath: '/recordings/rec_2.m4a',
    });
    loadTakes.mockResolvedValue([take, other]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

    await waitFor(() => expect(result.current.state).toBe('recorded'));
    await act(async () => {
      await result.current.seek(300, other);
    });

    expect(mockPlaybackLoad).toHaveBeenCalledWith(other.localFilePath);
    expect(mockPlaybackSeek).toHaveBeenCalledWith(300);
    expect(result.current.loadedTakeId).toBe('rec_2');
  });

  it('persists a single segment when pause/resume reuses the same file', async () => {
    const uri = 'file:///tmp/take.aac';
    mockRecordingPause.mockImplementation(async () => {
      mockRecordingState.status = 'paused';
      return { uri, durationMs: 500 };
    });
    mockRecordingResume.mockImplementation(async () => {
      mockRecordingState.status = 'recording';
    });
    mockRecordingStop.mockImplementation(async () => {
      mockRecordingState.status = 'idle';
      return { uri, durationMs: 900 };
    });

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.pause();
    });
    await act(async () => {
      await result.current.resume();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({ tempUri: uri, tempUris: [uri] }),
    );
  });

  it('keeps recovered segments plus one new segment across repeated pauses', async () => {
    const uri = 'file:///tmp/new.aac';
    mockPausedMarkers.push(recoveredMarker());
    mockRecordingPause.mockImplementation(async () => {
      mockRecordingState.status = 'paused';
      return { uri, durationMs: 400 };
    });
    mockRecordingResume.mockImplementation(async () => {
      mockRecordingState.status = 'recording';
    });
    mockRecordingStop.mockImplementation(async () => {
      mockRecordingState.status = 'idle';
      return { uri, durationMs: 700 };
    });

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('paused'));

    await act(async () => {
      await result.current.resume(); // idle recorder -> start() new segment
    });
    await act(async () => {
      await result.current.pause();
    });
    await act(async () => {
      await result.current.resume();
    });
    await act(async () => {
      await result.current.pause();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({
        tempUris: ['file:///old.aac', uri],
      }),
    );
  });

  it('does not re-hydrate the paused marker when the load effect re-runs mid-session', async () => {
    const uri = 'file:///tmp/take.aac';
    mockRecordingPause.mockImplementation(async () => {
      mockRecordingState.status = 'paused';
      return { uri, durationMs: 500 };
    });

    const { result, rerender } = renderHook(
      ({ load }: { load: typeof loadTakes }) =>
        useVerseAudio({ ...recoveryArgs(), loadTakes: load }),
      { initialProps: { load: loadTakes } },
    );
    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.pause();
    });
    mockFileExists.mockClear();

    // New loadTakes identity re-runs the load effect, which finds the marker
    // that pause() just wrote.
    const reloaded = jest.fn().mockResolvedValue([]);
    await act(async () => {
      rerender({ load: reloaded });
    });
    await waitFor(() => expect(mockFileExists).toHaveBeenCalledWith(uri));
    await act(async () => {});

    // Hydration would copy the marker's 500ms into the recovered elapsed time
    // and double count it on stop.
    expect(result.current.recoveredElapsedMs).toBe(0);
  });

  it('stays paused when resuming a recovered take fails, and can still stop and save', async () => {
    mockPausedMarkers.push(recoveredMarker());
    mockRecordingStart.mockRejectedValue(new Error('mic revoked'));

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('paused'));

    await act(async () => {
      await result.current.resume();
    });

    expect(result.current.state).toBe('paused');
    expect(result.current.errorMessage).toBe('mic revoked');

    await act(async () => {
      await result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({
        tempUris: ['file:///old.aac'],
        durationMs: 1000,
      }),
    );
  });

  it('stays paused when persist fails, keeps the marker and segments, and retries Stop', async () => {
    persistTake.mockRejectedValueOnce(new Error('disk full'));

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    // Not error/idle: the Record buttons stay hidden, so start() cannot run.
    expect(result.current.state).toBe('paused');
    expect(result.current.errorMessage).toBe('disk full');
    expect(mockPausedMarkers).toEqual([
      expect.objectContaining({
        sessionKey: '7:3',
        segments: ['file:///tmp/take.m4a'],
        elapsedMs: 500,
      }),
    ]);
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();

    // Retry: the recorder is already stopped, so this saves the kept segments.
    await act(async () => {
      await result.current.stop();
    });

    expect(mockRecordingStop).toHaveBeenCalledTimes(1);
    expect(persistTake).toHaveBeenCalledTimes(2);
    expect(persistTake).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tempUris: ['file:///tmp/take.m4a'],
        durationMs: 500,
      }),
    );
    expect(mockClearPausedTake).toHaveBeenCalledWith('7:3');
    expect(result.current.state).toBe('recorded');
  });

  it('resumes after a multi-segment save failure without duplicating audio or elapsed time', async () => {
    mockPausedMarkers.push(recoveredMarker());
    persistTake.mockRejectedValueOnce(new Error('disk full'));
    mockRecordingStop
      .mockImplementationOnce(async () => {
        mockRecordingState.status = 'idle';
        return { uri: 'file:///segment-two.aac', durationMs: 500 };
      })
      .mockImplementationOnce(async () => {
        mockRecordingState.status = 'idle';
        return { uri: 'file:///segment-three.aac', durationMs: 700 };
      });
    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('paused'));
    await act(async () => {
      await result.current.resume();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.state).toBe('paused');
    expect(result.current.recoveredElapsedMs).toBe(1500);
    expect(mockPausedMarkers).toEqual([
      expect.objectContaining({
        segments: ['file:///old.aac', 'file:///segment-two.aac'],
        elapsedMs: 1500,
      }),
    ]);
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockNotifyPendingUploads).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.resume();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(mockRecordingStart).toHaveBeenCalledTimes(2);
    expect(mockRecordingResume).not.toHaveBeenCalled();
    expect(persistTake).toHaveBeenCalledTimes(2);
    expect(persistTake).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tempUri: 'file:///segment-three.aac',
        tempUris: [
          'file:///old.aac',
          'file:///segment-two.aac',
          'file:///segment-three.aac',
        ],
        durationMs: 2200,
      }),
    );
    expect(mockClearPausedTake).toHaveBeenCalledTimes(1);
    expect(mockNotifyPendingUploads).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(result.current.state).toBe('recorded');
  });

  it('rehydrates the full failed-save marker and frozen capture after hook remount', async () => {
    const capture = {
      bibleTextId: 40,
      granularity: 'pericope' as const,
      startChapter: 1,
      startVerse: 2,
      endChapter: 1,
      endVerse: 4,
    };
    mockPausedMarkers.push({ ...recoveredMarker(), capture });
    persistTake.mockRejectedValueOnce(new Error('disk full'));
    const first = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(first.result.current.state).toBe('paused'));
    await act(async () => {
      await first.result.current.resume();
    });
    await act(async () => {
      await first.result.current.stop();
    });
    expect(mockPausedMarkers).toEqual([
      expect.objectContaining({
        capture,
        segments: ['file:///old.aac', 'file:///tmp/take.m4a'],
        elapsedMs: 1500,
      }),
    ]);
    first.unmount();
    mockRecordingStop.mockClear();
    mockRecordingStart.mockClear();

    const second = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(second.result.current.state).toBe('paused'));
    expect(second.result.current.recoveredElapsedMs).toBe(1500);
    await act(async () => {
      await second.result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledTimes(2);
    expect(persistTake).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ...capture,
        viewBibleTextId: 42,
        tempUris: ['file:///old.aac', 'file:///tmp/take.m4a'],
        durationMs: 1500,
      }),
    );
    expect(mockRecordingStop).not.toHaveBeenCalled();
    expect(mockRecordingStart).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockPausedMarkers).toHaveLength(0);
    expect(second.result.current.state).toBe('recorded');
  });

  it('clears committed recovery before reload failure so remount does not offer the saved audio again', async () => {
    mockPausedMarkers.push(recoveredMarker());
    loadTakes
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('reload failed'));
    const first = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(first.result.current.state).toBe('paused'));
    await act(async () => {
      await first.result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledTimes(1);
    expect(mockClearPausedTake).toHaveBeenCalledWith('7:3');
    expect(mockPausedMarkers).toHaveLength(0);
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(first.result.current.state).toBe('error');
    expect(first.result.current.errorMessage).toBe('reload failed');
    expect(first.result.current.recoveredElapsedMs).toBe(0);
    // A repeated Stop must not insert another copy of the already committed take.
    await act(async () => {
      await first.result.current.stop();
    });
    expect(persistTake).toHaveBeenCalledTimes(1);
    first.unmount();

    const saved = makeTake({ id: 'rec_committed' });
    loadTakes.mockResolvedValue([saved]);
    const second = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(second.result.current.state).toBe('recorded'));
    expect(second.result.current.takes).toEqual([saved]);
    expect(second.result.current.recoveredElapsedMs).toBe(0);
    expect(persistTake).toHaveBeenCalledTimes(1);
    expect(mockRecordingStop).not.toHaveBeenCalled();
  });

  it('refuses start() while recovered audio is pending and deletes nothing', async () => {
    mockPausedMarkers.push(recoveredMarker());

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('paused'));

    await act(async () => {
      await result.current.start();
    });

    expect(mockRecordingStart).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockPausedMarkers).toHaveLength(1);
    expect(result.current.errorMessage).toMatch(/Save or discard/);
    expect(result.current.state).toBe('paused');
  });

  it('discarding a recovered take clears its marker and deletes its segments', async () => {
    mockPausedMarkers.push(recoveredMarker());
    // The real engine throws when stopped while idle (no native recorder yet).
    mockRecordingStop.mockRejectedValue(
      new Error('Cannot stop recorder while idle'),
    );

    const { result } = renderHook(() => useVerseAudio(recoveryArgs()));
    await waitFor(() => expect(result.current.state).toBe('paused'));

    await act(async () => {
      await result.current.discardCapture();
    });

    expect(mockClearPausedTake).toHaveBeenCalledWith('7:3');
    expect(mockDeleteFile).toHaveBeenCalledWith('file:///old.aac');
    expect(mockPausedMarkers).toHaveLength(0);
    expect(persistTake).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('ignores a stale hydration when the verse changes mid-check', async () => {
    mockPausedMarkers.push(recoveredMarker());
    let releaseFileCheck!: (exists: boolean) => void;
    mockFileExists.mockReturnValueOnce(
      new Promise<boolean>(resolve => {
        releaseFileCheck = resolve;
      }),
    );

    const { result, rerender } = renderHook(
      ({ id, verse }: { id: number; verse: number }) =>
        useVerseAudio({
          ...recoveryArgs(),
          bibleTextId: id,
          verseNumber: verse,
        }),
      { initialProps: { id: 42, verse: 3 } },
    );
    // Verse A's run is now parked on its segment file check.
    await waitFor(() => expect(mockFileExists).toHaveBeenCalled());

    await act(async () => {
      rerender({ id: 43, verse: 4 });
    });
    await waitFor(() => expect(loadTakes).toHaveBeenCalledWith(43));

    // Verse A's check finishes late. It must not write refs or dispatch RECOVER.
    await act(async () => {
      releaseFileCheck(true);
    });

    expect(result.current.state).not.toBe('paused');
    expect(result.current.recoveredElapsedMs).toBe(0);
    expect(mockClearPausedTake).not.toHaveBeenCalled();

    // Refs are clean, so verse B can record without being refused.
    await act(async () => {
      await result.current.start();
    });
    expect(mockRecordingStart).toHaveBeenCalled();
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.state).toBe('recording');
  });

  it('stopPlayback stops the engine and restores the recorded player UI (#866)', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
    await waitFor(() => expect(result.current.state).toBe('recorded'));

    await act(async () => {
      await result.current.playTake(take);
    });
    expect(result.current.state).toBe('playing');
    expect(result.current.playingTakeId).toBe(take.id);
    expect(result.current.loadedTakeId).toBe(take.id);

    mockPlaybackStop.mockClear();
    await act(async () => {
      await result.current.stopPlayback();
    });

    expect(mockPlaybackStop).toHaveBeenCalled();
    expect(result.current.state).toBe('recorded');
    expect(result.current.playingTakeId).toBeNull();
    expect(result.current.loadedTakeId).toBeNull();
  });

  it('ignores a late playTake after stopPlayback (#866)', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);
    let releaseFileCheck: (exists: boolean) => void = () => {};
    mockFileExists.mockImplementationOnce(
      () =>
        new Promise<boolean>(resolve => {
          releaseFileCheck = resolve;
        }),
    );

    const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
    await waitFor(() => expect(result.current.state).toBe('recorded'));

    let playTakeDone: Promise<void> = Promise.resolve();
    await act(async () => {
      playTakeDone = result.current.playTake(take);
    });
    await waitFor(() => expect(mockFileExists).toHaveBeenCalled());

    await act(async () => {
      await result.current.stopPlayback();
    });
    await act(async () => {
      releaseFileCheck(true);
      await playTakeDone;
    });

    expect(mockPlaybackPlay).not.toHaveBeenCalled();
    expect(mockPlaybackResume).not.toHaveBeenCalled();
    expect(result.current.state).toBe('recorded');
    expect(result.current.playingTakeId).toBeNull();
    expect(result.current.loadedTakeId).toBeNull();

    await act(async () => {
      await result.current.playTake(take);
    });
    expect(mockPlaybackPlay).toHaveBeenCalledWith(take.localFilePath);
    expect(result.current.state).toBe('playing');
    expect(result.current.playingTakeId).toBe(take.id);
  });

  it('stops the playback engine when the hook unmounts (#866)', async () => {
    const take = makeTake();
    loadTakes.mockResolvedValue([take]);
    const { result, unmount } = renderHook(() =>
      useVerseAudio(verseAudioArgs()),
    );
    await waitFor(() => expect(result.current.state).toBe('recorded'));
    await act(async () => {
      await result.current.playTake(take);
    });
    mockPlaybackStop.mockClear();
    unmount();
    expect(mockPlaybackStop).toHaveBeenCalled();
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

  it('refreshes uploaded take badges from upload completion without interrupting playback', async () => {
    const pending = makeTake({ syncStatus: 'pending' });
    const uploaded = {
      ...pending,
      syncStatus: 'uploaded' as const,
      blobKey: 'unit-19/text-34844',
      versionToken: 2,
    };
    const loadAllTakes = jest
      .fn()
      .mockResolvedValue([{ ...pending, ownerDisplayName: 'Recorder' }]);
    loadTakes.mockResolvedValue([pending]);
    const { result } = renderHook(() =>
      useVerseAudio({ ...verseAudioArgs(), loadAllTakes }),
    );
    await waitFor(() => expect(result.current.allTakes).toHaveLength(1));
    await act(async () => {
      await result.current.playTake(pending);
    });
    expect(result.current.state).toBe('playing');
    mockPlaybackStop.mockClear();
    mockPlaybackPlay.mockClear();
    mockPlaybackLoad.mockClear();
    loadTakes.mockResolvedValue([uploaded]);
    loadAllTakes.mockResolvedValue([
      { ...uploaded, ownerDisplayName: 'Recorder' },
    ]);

    act(() => {
      emitUploadSessionEvent({ type: 'complete' });
    });

    await waitFor(() => expect(result.current.takes).toEqual([uploaded]));
    await waitFor(() =>
      expect(result.current.allTakes[0]?.syncStatus).toBe('uploaded'),
    );
    expect(result.current.state).toBe('playing');
    expect(result.current.playingTakeId).toBe(pending.id);
    expect(result.current.loadedTakeId).toBe(pending.id);
    expect(mockPlaybackStop).not.toHaveBeenCalled();
    expect(mockPlaybackPlay).not.toHaveBeenCalled();
    expect(mockPlaybackLoad).not.toHaveBeenCalled();
  });

  it('refreshes take data on recording mutation and unsubscribes after unmount', async () => {
    const pending = makeTake();
    const updated = { ...pending, syncStatus: 'failed' as const };
    loadTakes.mockResolvedValue([pending]);
    const { result, unmount } = renderHook(() =>
      useVerseAudio(verseAudioArgs()),
    );
    await waitFor(() => expect(result.current.takes).toEqual([pending]));
    loadTakes.mockResolvedValue([updated]);
    act(() => {
      emitRecordingDataChanged();
    });
    await waitFor(() => expect(result.current.takes).toEqual([updated]));
    unmount();
    loadTakes.mockClear();

    act(() => {
      emitRecordingDataChanged();
      emitUploadSessionEvent({ type: 'complete' });
    });
    await act(async () => {});
    expect(loadTakes).not.toHaveBeenCalled();
  });

  it('ignores an old-verse status refresh after navigation to a different verse', async () => {
    const oldTake = makeTake();
    const nextTake = makeTake({ id: 'next', bibleTextId: 43 });
    loadTakes.mockImplementation((id: number) =>
      Promise.resolve(id === 42 ? [oldTake] : [nextTake]),
    );
    const { result, rerender } = renderHook(
      ({ bibleTextId }: { bibleTextId: number }) =>
        useVerseAudio({ ...verseAudioArgs(), bibleTextId }),
      { initialProps: { bibleTextId: 42 } },
    );
    await waitFor(() => expect(result.current.takes).toEqual([oldTake]));
    let finishOldRefresh!: (takes: Recording[]) => void;
    loadTakes.mockImplementationOnce(
      () =>
        new Promise<Recording[]>(resolve => {
          finishOldRefresh = resolve;
        }),
    );
    const before = loadTakes.mock.calls.length;
    act(() => {
      emitUploadSessionEvent({ type: 'complete' });
    });
    await waitFor(() =>
      expect(loadTakes.mock.calls.length).toBeGreaterThan(before),
    );
    rerender({ bibleTextId: 43 });
    await waitFor(() => expect(result.current.takes).toEqual([nextTake]));
    await act(async () => {
      finishOldRefresh([{ ...oldTake, syncStatus: 'uploaded' }]);
    });
    expect(result.current.takes).toEqual([nextTake]);
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

    let setCanonicalPromise: Promise<boolean>;
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
      projectUnitId: null,
      tempUri: 'file:///tmp/take.m4a',
      tempUris: ['file:///tmp/take.m4a'],
      durationMs: 2500,
      granularity: 'pericope',
      startChapter: 1,
      startVerse: 3,
      endChapter: 1,
      endVerse: 7,
    });
  });

  it('freezes projectUnitId into the capture persist snapshot (#613)', async () => {
    loadTakes.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { result } = renderHook(() =>
      useVerseAudio({
        ...verseAudioArgs(),
        projectUnitId: 473,
      }),
    );

    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({ projectUnitId: 473, bibleTextId: 42 }),
    );
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

  it('rejects start without recording when the pericope take count fails', async () => {
    const countTakesAtView = jest.fn().mockResolvedValue(0);
    loadTakes.mockResolvedValue([]);
    const args = {
      ...verseAudioArgs(),
      draftingUnit: 'pericope' as const,
      chapterNumber: 1,
      verseNumber: 3,
      countTakesAtView,
      recordingUnit: {
        granularity: 'pericope' as const,
        startChapter: 1,
        startVerse: 3,
        endChapter: 1,
        endVerse: 3,
        anchorBibleTextId: 103,
        coveredViews: [{ bibleTextId: 103, chapterNumber: 1, verseNumber: 3 }],
      },
    };

    const { result } = renderHook(() => useVerseAudio(args));
    await waitFor(() => expect(result.current.canRecordNewTake).toBe(true));
    countTakesAtView.mockRejectedValueOnce(new Error('count failed'));

    // Nothing reports this one, so the caller (useRecorder) explains it.
    let thrown: unknown;
    await act(async () => {
      await result.current.start().catch(e => {
        thrown = e;
      });
    });

    expect(thrown).toEqual(new Error('count failed'));
    expect(mockRecordingStart).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
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

    expect(getTakesForVerse).toHaveBeenCalledWith(
      103,
      undefined,
      {
        chapterNumber: 1,
        verseNumber: 3,
      },
      null,
    );
    expect(getTakesForVerse).toHaveBeenCalledWith(
      104,
      undefined,
      {
        chapterNumber: 1,
        verseNumber: 4,
      },
      null,
    );
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

  describe('seek (#833)', () => {
    it('seeks the explicit target take instead of the selected one', async () => {
      const ownTake = makeTake();
      const sharedTake = makeTake({
        id: 'rec_9',
        localFilePath: '/recordings/rec_9.m4a',
        isSelected: false,
      });
      loadTakes.mockResolvedValue([ownTake]);

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.takes).toHaveLength(1));

      await act(async () => {
        await result.current.seek(500, sharedTake);
      });

      expect(mockPlaybackLoad).toHaveBeenCalledWith('/recordings/rec_9.m4a');
      expect(mockPlaybackSeek).toHaveBeenCalledWith(500);
      expect(result.current.loadedTakeId).toBe('rec_9');
    });

    it('resolves the loaded take from allTakes when it is not one of mine', async () => {
      const ownTake = makeTake();
      const sharedTake = makeTake({
        id: 'rec_9',
        localFilePath: '/recordings/rec_9.m4a',
        isSelected: false,
      });
      loadTakes.mockResolvedValue([ownTake]);
      const loadAllTakes = jest.fn().mockResolvedValue([
        { ...ownTake, ownerDisplayName: 'Me' },
        { ...sharedTake, ownerDisplayName: 'John Doe' },
      ]);

      const { result } = renderHook(() =>
        useVerseAudio({ ...verseAudioArgs(), loadAllTakes }),
      );
      await waitFor(() => expect(result.current.allTakes).toHaveLength(2));

      // Another recorder's take is what is in the player, but it is absent
      // from my own `takes` list.
      await act(async () => {
        await result.current.playTake(sharedTake);
      });
      expect(result.current.loadedTakeId).toBe('rec_9');
      mockPlaybackLoad.mockClear();
      mockPlaybackSeek.mockClear();

      await act(async () => {
        await result.current.seek(500);
      });

      // Without the allTakes lookup this would fall back to the selected
      // own take (rec_1).
      expect(mockPlaybackLoad).toHaveBeenCalledWith('/recordings/rec_9.m4a');
      expect(mockPlaybackSeek).toHaveBeenCalledWith(500);
    });

    it.each([
      ['checking the file', 'exists'],
      ['loading it', 'load'],
    ])(
      'drops a scrub stopped while %s (#910)',
      async (_name, during: string) => {
        loadTakes.mockResolvedValue([makeTake()]);
        const sharedTake = makeTake({
          id: 'rec_9',
          localFilePath: '/recordings/rec_9.m4a',
          isSelected: false,
        });
        const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
        await waitFor(() => expect(result.current.takes).toHaveLength(1));

        let release!: () => void;
        const held = new Promise<void>(r => (release = r));
        if (during === 'exists') {
          mockFileExists.mockReturnValueOnce(held.then(() => true));
        } else {
          mockPlaybackLoad.mockReturnValueOnce(held);
        }
        let seeking!: Promise<void>;
        act(() => {
          seeking = result.current.seek(500, sharedTake);
        });
        await act(async () => {
          await result.current.stopPlayback();
        });
        await act(async () => {
          release();
          await seeking;
        });

        expect(mockPlaybackSeek).not.toHaveBeenCalled();
        expect(result.current.loadedTakeId).toBeNull();
        expect(result.current.playingTakeId).toBeNull();
      },
    );
  });

  describe('seekStitched', () => {
    it('while playing: load + seek, then resume without play/replace', async () => {
      loadTakes.mockResolvedValue([makeTake()]);
      const stitchedRow = makeStitchedRow();

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      await act(async () => {
        await result.current.playStitched(stitchedRow);
      });
      expect(result.current.state).toBe('playing');
      mockPlaybackPlay.mockClear();
      mockPlaybackLoad.mockClear();

      await act(async () => {
        await result.current.seekStitched(stitchedRow, 500);
      });

      expect(mockPlaybackLoad).toHaveBeenCalledWith('/recordings/v3.m4a');
      expect(mockPlaybackSeek).toHaveBeenCalledWith(500);
      expect(mockPlaybackResume).toHaveBeenCalledWith(
        500,
        '/recordings/v3.m4a',
      );
      expect(mockPlaybackPlay).not.toHaveBeenCalled();
      expect(mockPlaybackSeek.mock.invocationCallOrder[0]).toBeLessThan(
        mockPlaybackResume.mock.invocationCallOrder[0],
      );
      expect(result.current.stitchPositionMs).toBe(500);
      expect(result.current.state).toBe('playing');
    });

    it('maps a tap in the second segment to that file and offset', async () => {
      loadTakes.mockResolvedValue([makeTake()]);
      const stitchedRow = makeStitchedRow();

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      await act(async () => {
        await result.current.playStitched(stitchedRow);
      });
      mockPlaybackPlay.mockClear();

      await act(async () => {
        await result.current.seekStitched(stitchedRow, 1500);
      });

      expect(mockPlaybackLoad).toHaveBeenLastCalledWith('/recordings/v4.m4a');
      expect(mockPlaybackSeek).toHaveBeenLastCalledWith(500);
      expect(mockPlaybackResume).toHaveBeenCalledWith(
        500,
        '/recordings/v4.m4a',
      );
      expect(mockPlaybackPlay).not.toHaveBeenCalled();
      expect(result.current.stitchPositionMs).toBe(1500);
    });

    it('while not playing: seeks but does not resume', async () => {
      loadTakes.mockResolvedValue([makeTake()]);
      const stitchedRow = makeStitchedRow();

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      await act(async () => {
        await result.current.seekStitched(stitchedRow, 500);
      });

      expect(mockPlaybackSeek).toHaveBeenCalledWith(500);
      expect(mockPlaybackResume).not.toHaveBeenCalled();
      expect(mockPlaybackPlay).not.toHaveBeenCalled();
    });

    it('a superseded seek does not resume or release the in-flight flag', async () => {
      loadTakes.mockResolvedValue([makeTake()]);
      const stitchedRow = makeStitchedRow();

      const { result, rerender } = renderHook(() =>
        useVerseAudio(verseAudioArgs()),
      );
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      await act(async () => {
        await result.current.playStitched(stitchedRow);
      });

      // First seek's load is held open.
      let releaseFirstLoad!: () => void;
      mockPlaybackLoad.mockImplementationOnce(
        () =>
          new Promise<void>(r => {
            releaseFirstLoad = r;
          }),
      );
      let first!: Promise<void>;
      act(() => {
        first = result.current.seekStitched(stitchedRow, 300);
      });

      // Second seek supersedes it.
      await act(async () => {
        await result.current.seekStitched(stitchedRow, 1200);
      });
      mockPlaybackResume.mockClear();

      await act(async () => {
        releaseFirstLoad();
        await first;
      });

      // Stale first seek must not seek/resume after the newer one.
      expect(mockPlaybackSeek).not.toHaveBeenLastCalledWith(300);
      expect(mockPlaybackResume).not.toHaveBeenCalled();

      // Natural end right after must not skip the tapped segment
      playbackState.status = 'idle';
      await act(async () => {
        rerender(undefined);
      });
      expect(result.current.state).toBe('recorded');
    });

    it('pause invalidates an in-flight wasPlaying seek so resume does not fire', async () => {
      loadTakes.mockResolvedValue([makeTake()]);
      const stitchedRow = makeStitchedRow();

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      await act(async () => {
        await result.current.playStitched(stitchedRow);
      });
      expect(result.current.state).toBe('playing');

      let releaseLoad!: () => void;
      mockPlaybackLoad.mockImplementationOnce(
        () =>
          new Promise<void>(r => {
            releaseLoad = r;
          }),
      );
      let seeking!: Promise<void>;
      act(() => {
        seeking = result.current.seekStitched(stitchedRow, 500);
      });

      mockPlaybackResume.mockClear();
      await act(async () => {
        await result.current.pausePlayback();
      });
      expect(result.current.state).not.toBe('playing');

      await act(async () => {
        releaseLoad();
        await seeking;
      });

      expect(mockPlaybackResume).not.toHaveBeenCalled();
      expect(result.current.state).not.toBe('playing');
      // Queue kept so Play can resume in-segment after pause.
      expect(result.current.playingTakeId).toBe(stitchedRow.id);
    });

    it('keeps the scrub position on the bar when Play resumes the same row', async () => {
      loadTakes.mockResolvedValue([makeTake()]);
      const stitchedRow = makeStitchedRow();

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));
      await waitFor(() => expect(result.current.state).toBe('recorded'));

      // Scrub while idle: queue is set, nothing plays.
      await act(async () => {
        await result.current.seekStitched(stitchedRow, 1500);
      });
      expect(result.current.stitchPositionMs).toBe(1500);

      // Hold the resume's play() open so the load window is observable.
      let releasePlay: () => void = () => {};
      mockPlaybackPlay.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            releasePlay = resolve;
          }),
      );

      let resuming!: Promise<void>;
      await act(async () => {
        resuming = result.current.playStitched(stitchedRow);
      });

      // Wait until the file checks passed and play() is parked.
      await waitFor(() => expect(mockPlaybackPlay).toHaveBeenCalled());

      // While loading, the bar must not drop to the segment start (1000).
      expect(result.current.stitchPositionMs).toBeGreaterThanOrEqual(1500);

      await act(async () => {
        releasePlay();
        await resuming;
      });
      expect(mockPlaybackPlay).toHaveBeenCalledWith('/recordings/v4.m4a');
    });
  });

  // --- #49: discard an in-progress capture ---------------------------------

  describe('discardCapture (#49)', () => {
    it('stops the recorder, deletes the temp file, persists nothing, and lands in idle', async () => {
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

      await waitFor(() => expect(result.current.state).toBe('idle'));

      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        await result.current.pause();
      });
      expect(result.current.state).toBe('paused');

      await act(async () => {
        await result.current.discardCapture();
      });

      expect(mockRecordingStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteFile).toHaveBeenCalledWith('file:///tmp/take.m4a');
      expect(persistTake).not.toHaveBeenCalled();
      expect(loadTakes).toHaveBeenCalledTimes(1); // initial load only
      expect(result.current.state).toBe('idle');
      expect(result.current.errorMessage).toBeNull();
    });

    it('discards from recording (not just paused)', async () => {
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

      await waitFor(() => expect(result.current.state).toBe('idle'));

      await act(async () => {
        await result.current.start();
      });
      expect(result.current.state).toBe('recording');

      await act(async () => {
        await result.current.discardCapture();
      });

      expect(mockRecordingStop).toHaveBeenCalledTimes(1);
      expect(mockDeleteFile).toHaveBeenCalledWith('file:///tmp/take.m4a');
      expect(persistTake).not.toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
    });

    it('does not fire the chapter-claim flow on discard', async () => {
      const { claimChapterOffline } = jest.requireMock('../db/repository');
      const { syncChapterClaim } = jest.requireMock(
        '../services/chapterClaimSync',
      );

      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs(),
          chapterAssignmentId: 5,
          userId: 99,
          chapterClaim: {
            bibleId: 1,
            bookId: 40,
            chapterNumber: 14,
            assignedUserId: null,
          },
        }),
      );

      await waitFor(() => expect(result.current.state).toBe('idle'));

      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        await result.current.discardCapture();
      });

      expect(claimChapterOffline).not.toHaveBeenCalled();
      expect(syncChapterClaim).not.toHaveBeenCalled();
      expect(persistTake).not.toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
    });

    it('is a no-op when no capture is in progress', async () => {
      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

      await waitFor(() => expect(result.current.state).toBe('idle'));

      await act(async () => {
        await result.current.discardCapture();
      });

      expect(mockRecordingStop).not.toHaveBeenCalled();
      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(persistTake).not.toHaveBeenCalled();
      expect(result.current.state).toBe('idle');
    });

    it('still resets to idle when the recorder stop fails (best-effort discard)', async () => {
      mockRecordingStop.mockRejectedValue(new Error('native stop failed'));

      const { result } = renderHook(() => useVerseAudio(verseAudioArgs()));

      await waitFor(() => expect(result.current.state).toBe('idle'));

      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        await result.current.discardCapture();
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.errorMessage).toBeNull();
      expect(persistTake).not.toHaveBeenCalled();
    });
  });
});
