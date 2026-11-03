import { act, renderHook, waitFor } from '@testing-library/react-native';

jest.mock('expo', () => {
  const actual = jest.requireActual('expo');
  return { ...actual, useEventListener: () => undefined };
});
import { getConnectivitySnapshot } from '../services/connectivity';
import type { Recording } from '../types/db/types';
import { useVerseAudio } from './useVerseAudio';

jest.mock('./useRecordingEngine', () => ({
  useRecordingEngine: () => ({
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    status: 'idle',
  }),
}));

jest.mock('../utils/audioStorage', () => ({
  deleteFile: jest.fn(),
  ensureRecordingsDir: jest.fn(),
  fileExists: jest.fn(async () => true),
  fileSize: jest.fn(async () => 100),
  recordingPath: jest.fn((id: string) => `/recordings/${id}.m4a`),
}));

jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
}));

jest.mock('../services/pausedTakes', () => ({
  clearPausedTake: jest.fn(),
  isPausedTakeOrphaned: () => false,
  listPausedTakes: () => [],
  upsertPausedTake: jest.fn(),
}));

jest.mock('../services/uploadOrchestrator', () => ({
  notifyPendingUploads: jest.fn(),
}));

jest.mock('../services/chapterClaimSync', () => ({
  syncChapterClaim: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  addRecordingTake: jest.fn(),
  deleteRecordingTake: jest.fn(),
  getTakesForVerse: jest.fn(),
  getAllTakesForVerse: jest.fn(async () => []),
  verseHasMultipleRecorders: jest.fn(async () => false),
  selectRecordingTake: jest.fn(),
  claimChapterOffline: jest.fn(),
}));

const mockConnectivity = getConnectivitySnapshot as jest.Mock;

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

describe('useVerseAudio playback position', () => {
  const loadTakes = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectivity.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
  });

  async function playingHook(takes: Recording[]) {
    loadTakes.mockResolvedValue(takes);
    const hook = renderHook(() =>
      useVerseAudio({
        bibleTextId: 42,
        chapterAssignmentId: null,
        userId: null,
        loadTakes,
        persistTake: jest.fn(),
        deleteTake: jest.fn(),
        selectTake: jest.fn(),
      }),
    );
    await waitFor(() => expect(hook.result.current.state).toBe('recorded'));
    return hook;
  }

  it('starts at an explicit zero after the engine was already partway through the take', async () => {
    const take = makeTake();
    const { result } = await playingHook([take]);

    await act(async () => {
      await result.current.playTake(take, 400);
    });
    await waitFor(() => expect(result.current.positionMs).toBe(400));

    await act(async () => {
      await result.current.pausePlayback();
    });
    await act(async () => {
      await result.current.playTake(take, 0);
    });

    await waitFor(() => expect(result.current.positionMs).toBe(0));
  });

  it('keeps the current position when play is asked to resume', async () => {
    const take = makeTake();
    const { result } = await playingHook([take]);

    await act(async () => {
      await result.current.playTake(take, 400);
    });
    await act(async () => {
      await result.current.pausePlayback();
    });
    await act(async () => {
      await result.current.playTake(take);
    });

    await waitFor(() => expect(result.current.positionMs).toBe(400));
  });

  it('seeks the take it was given when that take is not the selected one', async () => {
    const selected = makeTake();
    const other = makeTake({
      id: 'rec_2',
      takeNumber: 2,
      isSelected: false,
      localFilePath: '/recordings/rec_2.m4a',
    });
    const { result } = await playingHook([selected, other]);

    await act(async () => {
      await result.current.playTake(selected, 200);
    });
    await act(async () => {
      await result.current.seek(0, other);
    });

    await waitFor(() => {
      expect(result.current.loadedTakeId).toBe('rec_2');
      expect(result.current.positionMs).toBe(0);
    });
  });
});
