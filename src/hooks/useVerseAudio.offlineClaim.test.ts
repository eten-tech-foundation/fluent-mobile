import { renderHook, waitFor, act } from '@testing-library/react-native';
import { getConnectivitySnapshot } from '../services/connectivity';
import { useRecordingEngine } from './useRecordingEngine';
import { usePlaybackEngine } from './usePlaybackEngine';
import { claimChapterOffline } from '../db/repository';
import { useVerseAudio } from './useVerseAudio';
import { logger } from '../utils/logger';

type VerseAudioResult = ReturnType<typeof useVerseAudio>;

jest.mock('../db/repository', () => ({
  addRecordingTake: jest.fn(),
  deleteRecordingTake: jest.fn(),
  getTakesForVerse: jest.fn(),
  selectRecordingTake: jest.fn(),
  claimChapterOffline: jest.fn(),
}));

jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
}));

jest.mock('./useRecordingEngine');
jest.mock('./usePlaybackEngine');

const mockClaimChapterOffline = claimChapterOffline as jest.Mock;
const mockGetConnectivitySnapshot = getConnectivitySnapshot as jest.Mock;
const mockUseRecordingEngine = useRecordingEngine as jest.Mock;
const mockUsePlaybackEngine = usePlaybackEngine as jest.Mock;

const BIBLE_TEXT_ID = 42;
const CHAPTER_ASSIGNMENT_ID = 7;

function setupEngines() {
  const recording = {
    start: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    stop: jest
      .fn()
      .mockResolvedValue({ uri: 'file:///tmp.m4a', durationMs: 1000 }),
  };
  const playback = {
    status: 'idle',
    positionMs: 0,
    durationMs: 0,
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    load: jest.fn().mockResolvedValue(undefined),
    seek: jest.fn().mockResolvedValue(undefined),
  };
  mockUseRecordingEngine.mockReturnValue(recording);
  mockUsePlaybackEngine.mockReturnValue(playback);
  return { recording, playback };
}

async function stopAfterStart(hookResult: { current: VerseAudioResult }) {
  await act(async () => {
    await hookResult.current.start();
  });
  await act(async () => {
    await hookResult.current.stop();
  });
}

describe('useVerseAudio offline claim (#270)', () => {
  const persistTake = jest.fn();
  const loadTakes = jest.fn();
  const mockTransport = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    setupEngines();
    persistTake.mockResolvedValue({
      id: 'rec_1',
      localFilePath: 'file:///rec_1.m4a',
    });
    loadTakes.mockResolvedValue([]);
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
    });
    mockClaimChapterOffline.mockResolvedValue(true);
    logger.setTransport(mockTransport);
  });

  afterEach(() => {
    logger.reset();
  });

  it('claims the chapter when offline with a known user', async () => {
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: false,
      isWifi: false,
      isCellular: false,
    });

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: BIBLE_TEXT_ID,
        chapterAssignmentId: CHAPTER_ASSIGNMENT_ID,
        userId: 5,
        persistTake,
        loadTakes,
      }),
    );

    await stopAfterStart(result);

    expect(mockClaimChapterOffline).toHaveBeenCalledWith(
      CHAPTER_ASSIGNMENT_ID,
      5,
    );
    await waitFor(() => expect(result.current.state).toBe('recorded'));
  });

  it('does not claim when online, even with a known user', async () => {
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
    });

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: BIBLE_TEXT_ID,
        chapterAssignmentId: CHAPTER_ASSIGNMENT_ID,
        userId: 5,
        persistTake,
        loadTakes,
      }),
    );

    await stopAfterStart(result);

    expect(mockClaimChapterOffline).not.toHaveBeenCalled();
  });

  it('does not claim when userId is null, even offline', async () => {
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: false,
      isWifi: false,
      isCellular: false,
    });

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: BIBLE_TEXT_ID,
        chapterAssignmentId: CHAPTER_ASSIGNMENT_ID,
        userId: null,
        persistTake,
        loadTakes,
      }),
    );

    await stopAfterStart(result);

    expect(mockClaimChapterOffline).not.toHaveBeenCalled();
    // Connectivity check is skipped entirely when userId is null (short-circuit).
    expect(mockGetConnectivitySnapshot).not.toHaveBeenCalled();
  });

  it('does not claim when chapterAssignmentId is null, even offline with a known user', async () => {
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: false,
      isWifi: false,
      isCellular: false,
    });

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: BIBLE_TEXT_ID,
        chapterAssignmentId: null,
        userId: 5,
        persistTake,
        loadTakes,
      }),
    );

    await stopAfterStart(result);

    expect(mockClaimChapterOffline).not.toHaveBeenCalled();
  });

  it('still saves the take and reaches recorded state when the claim call throws, and logs the failure', async () => {
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: false,
      isWifi: false,
      isCellular: false,
    });
    mockClaimChapterOffline.mockRejectedValue(new Error('db locked'));

    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: BIBLE_TEXT_ID,
        chapterAssignmentId: CHAPTER_ASSIGNMENT_ID,
        userId: 5,
        persistTake,
        loadTakes,
      }),
    );

    await stopAfterStart(result);

    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({ bibleTextId: BIBLE_TEXT_ID }),
    );
    expect(result.current.errorMessage).toBeNull();
    await waitFor(() => expect(result.current.state).toBe('recorded'));

    expect(mockTransport).toHaveBeenCalledWith(
      'error',
      'useVerseAudio',
      'Offline chapter claim failed',
      expect.objectContaining({ message: 'db locked' }),
    );
  });
});
