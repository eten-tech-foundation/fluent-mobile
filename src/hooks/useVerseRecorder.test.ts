import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useVerseRecorder } from './useVerseRecorder';

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
const mockBuildRecordingKey = jest.fn();
const mockDeleteRecordingFile = jest.fn();

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
  buildRecordingKey: (parts: unknown) => {
    mockBuildRecordingKey(parts);
    return MOVED_KEY;
  },
  extensionFromUri: jest.fn(() => 'm4a'),
  moveIntoStore: jest.fn(async ({ key }: { key: string }) => ({
    key,
    sizeBytes: 1234,
  })),
  resolveRecordingUri: jest.fn((pathOrKey: string) => pathOrKey),
  deleteRecordingFile: (pathOrKey: string) =>
    mockDeleteRecordingFile(pathOrKey),
}));

jest.mock('../services/storage', () => ({
  getPausedTake: (id: number) => mockGetPausedTake(id),
  setPausedTake: (marker: unknown) => mockSetPausedTake(marker),
  clearPausedTake: (id: number) => mockClearPausedTake(id),
}));

const RESOLVE_MOCK = jest.requireMock('../services/recordingStorage')
  .resolveRecordingUri as jest.Mock;

function existingRecording(overrides: Record<string, unknown> = {}) {
  return {
    id: 'existing',
    bibleTextId: 42,
    localFilePath: 'recordings/u/p1/MRK/c014/v001/existing.m4a',
    takeNumber: 1,
    isLatest: true,
    syncStatus: 'pending',
    createdAt: 'x',
    updatedAt: 'x',
    ...overrides,
  };
}

async function waitReady(result: { current: { isReady: boolean } }) {
  await waitFor(() => expect(result.current.isReady).toBe(true));
}

describe('useVerseRecorder', () => {
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
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({
      remove: jest.fn(),
    } as unknown as ReturnType<typeof AppState.addEventListener>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads the latest verse recording on mount', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce(existingRecording());
    const { result } = renderHook(() => useVerseRecorder({ bibleTextId: 42 }));
    await waitReady(result);

    expect(mockGetLatestRecordingForVerse).toHaveBeenCalledWith(42);
    expect(result.current.status).toBe('review');
    expect(result.current.currentRecording?.id).toBe('existing');
  });

  it('persists the paused marker keyed by bibleTextId', async () => {
    jest.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useVerseRecorder({ bibleTextId: 42 }),
      );
      await waitReady(result);

      jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
      await act(async () => {
        await result.current.start();
      });

      jest.setSystemTime(new Date('2026-07-01T00:00:02.500Z'));
      await act(async () => {
        await result.current.pause();
      });

      expect(mockSetPausedTake).toHaveBeenCalledWith(
        expect.objectContaining({
          bibleTextId: 42,
          fileUri: 'file:///tmp/take-1.m4a',
          elapsedMs: 2500,
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('commits a stopped take into durable storage and the DB', async () => {
    jest.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useVerseRecorder({
          bibleTextId: 42,
          userId: 'user-7',
          projectId: 55,
          chapterAssignmentId: 88,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 1,
        }),
      );
      await waitReady(result);

      jest.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
      await act(async () => {
        await result.current.start();
      });

      jest.setSystemTime(new Date('2026-07-01T00:00:03.000Z'));
      await act(async () => {
        await result.current.stop();
      });

      expect(mockBuildRecordingKey).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-7',
          projectId: 55,
          bookCode: 'MRK',
          chapterNumber: 14,
          verseNumber: 1,
          recordingId: 'test-uuid-1',
        }),
      );
      expect(mockInsertRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-1',
          bibleTextId: 42,
          chapterAssignmentId: 88,
          localFilePath: MOVED_KEY,
          durationMs: 3000,
          fileSizeBytes: 1234,
        }),
      );
      expect(mockClearPausedTake).toHaveBeenCalledWith(42);
      expect(result.current.status).toBe('review');
    } finally {
      jest.useRealTimers();
    }
  });

  it('deletes the current take via the repository', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce(existingRecording());
    const { result } = renderHook(() => useVerseRecorder({ bibleTextId: 42 }));
    await waitReady(result);

    await act(async () => {
      await result.current.deleteCurrent();
    });

    expect(mockDeleteRecordingById).toHaveBeenCalledWith('existing');
    expect(result.current.status).toBe('idle');
    expect(result.current.currentRecording).toBeNull();
  });

  it('unlinks the durable partial file when a paused take is discarded', async () => {
    mockGetPausedTake.mockReturnValue({
      bibleTextId: 42,
      fileUri: 'file:///docs/partial-take.m4a',
      elapsedMs: 4500,
      startedAt: '2026-07-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useVerseRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    expect(result.current.status).toBe('paused');

    await act(async () => {
      await result.current.discardPaused();
    });

    expect(mockDeleteRecordingFile).toHaveBeenCalledWith(
      'file:///docs/partial-take.m4a',
    );
    expect(mockClearPausedTake).toHaveBeenCalledWith(42);
    expect(result.current.status).toBe('idle');
  });

  it('resolves the stored key to an absolute uri for playback', async () => {
    mockGetLatestRecordingForVerse.mockResolvedValueOnce(existingRecording());
    const { result } = renderHook(() => useVerseRecorder({ bibleTextId: 42 }));
    await waitReady(result);
    expect(result.current.status).toBe('review');

    await act(async () => {
      await result.current.togglePlayback();
    });

    expect(RESOLVE_MOCK).toHaveBeenCalledWith(
      'recordings/u/p1/MRK/c014/v001/existing.m4a',
    );
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });
});
