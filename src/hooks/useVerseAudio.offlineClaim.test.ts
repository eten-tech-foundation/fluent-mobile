import { renderHook, waitFor, act } from '@testing-library/react-native';
import { getConnectivitySnapshot } from '../services/connectivity';
import { useRecordingEngine } from './useRecordingEngine';
import { usePlaybackEngine } from './usePlaybackEngine';
import { claimChapterOffline } from '../db/repository';
import { syncChapterClaim } from '../services/chapterClaimSync';
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

jest.mock('../services/chapterClaimSync', () => ({
  syncChapterClaim: jest.fn(),
}));

jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
}));

jest.mock('./useRecordingEngine');
jest.mock('./usePlaybackEngine');

const mockClaimChapterOffline = claimChapterOffline as jest.Mock;
const mockSyncChapterClaim = syncChapterClaim as jest.Mock;
const mockGetConnectivitySnapshot = getConnectivitySnapshot as jest.Mock;
const mockUseRecordingEngine = useRecordingEngine as jest.Mock;
const mockUsePlaybackEngine = usePlaybackEngine as jest.Mock;

const BIBLE_TEXT_ID = 42;
const CHAPTER_ASSIGNMENT_ID = 7;
const USER_ID = 5;

const chapterClaim = {
  bibleId: 1,
  bookId: 2,
  chapterNumber: 3,
  assignedUserId: null as number | null,
};

function verseAudioArgs(
  overrides: Partial<Parameters<typeof useVerseAudio>[0]> = {},
) {
  return {
    bibleTextId: BIBLE_TEXT_ID,
    chapterAssignmentId: CHAPTER_ASSIGNMENT_ID,
    userId: USER_ID,
    chapterClaim,
    persistTake: jest.fn(),
    loadTakes: jest.fn(),
    ...overrides,
  };
}

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

describe('useVerseAudio chapter claim (#268 / #270)', () => {
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
    mockSyncChapterClaim.mockResolvedValue({
      chapterAssignmentId: CHAPTER_ASSIGNMENT_ID,
      assignedUserId: USER_ID,
      status: 'draft',
      hasClaimConflict: false,
    });
    logger.setTransport(mockTransport);
  });

  afterEach(() => {
    logger.reset();
  });

  describe('offline (#270)', () => {
    beforeEach(() => {
      mockGetConnectivitySnapshot.mockResolvedValue({
        isOnline: false,
        isWifi: false,
        isCellular: false,
      });
    });

    it('claims the chapter when offline with a known user', async () => {
      const onChapterClaimed = jest.fn();
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs(),
          persistTake,
          loadTakes,
          onChapterClaimed,
        }),
      );

      await stopAfterStart(result);

      expect(mockClaimChapterOffline).toHaveBeenCalledWith(
        CHAPTER_ASSIGNMENT_ID,
        USER_ID,
      );
      expect(onChapterClaimed).toHaveBeenCalled();
      await waitFor(() => expect(result.current.state).toBe('recorded'));
    });

    it('does not claim when userId is null, even offline', async () => {
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs({ userId: null }),
          persistTake,
          loadTakes,
        }),
      );

      await stopAfterStart(result);

      expect(mockClaimChapterOffline).not.toHaveBeenCalled();
      expect(mockGetConnectivitySnapshot).not.toHaveBeenCalled();
    });

    it('does not claim when chapterAssignmentId is null, even offline', async () => {
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs({ chapterAssignmentId: null }),
          persistTake,
          loadTakes,
        }),
      );

      await stopAfterStart(result);

      expect(mockClaimChapterOffline).not.toHaveBeenCalled();
    });

    it('still saves the take when offline claim throws, and logs the failure', async () => {
      mockClaimChapterOffline.mockRejectedValue(new Error('db locked'));

      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs(),
          persistTake,
          loadTakes,
        }),
      );

      await stopAfterStart(result);

      await waitFor(() => expect(result.current.state).toBe('recorded'));
      expect(mockTransport).toHaveBeenCalledWith(
        'error',
        'useVerseAudio',
        'Chapter claim failed',
        expect.objectContaining({ message: 'db locked' }),
      );
    });
  });

  describe('online (#268)', () => {
    it('syncs claim when the chapter is unassigned and online', async () => {
      const onChapterClaimed = jest.fn();
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs(),
          persistTake,
          loadTakes,
          onChapterClaimed,
        }),
      );

      await stopAfterStart(result);

      expect(mockClaimChapterOffline).not.toHaveBeenCalled();
      expect(mockSyncChapterClaim).toHaveBeenCalledWith(
        CHAPTER_ASSIGNMENT_ID,
        USER_ID,
      );
      expect(onChapterClaimed).toHaveBeenCalled();
    });

    it('retries claim on a later take while the chapter remains unassigned', async () => {
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs(),
          persistTake,
          loadTakes,
        }),
      );

      mockSyncChapterClaim.mockRejectedValueOnce(new Error('network error'));

      await stopAfterStart(result);
      await stopAfterStart(result);

      expect(mockSyncChapterClaim).toHaveBeenCalledTimes(2);
    });

    it('does not claim again after a successful online claim in the same session', async () => {
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs(),
          persistTake,
          loadTakes,
        }),
      );

      await stopAfterStart(result);
      await stopAfterStart(result);

      expect(mockSyncChapterClaim).toHaveBeenCalledTimes(1);
    });

    it('does not claim online when the chapter is already assigned locally', async () => {
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs({
            chapterClaim: { ...chapterClaim, assignedUserId: 99 },
          }),
          persistTake,
          loadTakes,
        }),
      );

      await stopAfterStart(result);

      expect(mockSyncChapterClaim).not.toHaveBeenCalled();
      expect(mockGetConnectivitySnapshot).not.toHaveBeenCalled();
    });

    it('does not claim when chapterClaim context is omitted', async () => {
      const { result } = renderHook(() =>
        useVerseAudio({
          ...verseAudioArgs({ chapterClaim: null }),
          persistTake,
          loadTakes,
        }),
      );

      await stopAfterStart(result);

      expect(mockSyncChapterClaim).not.toHaveBeenCalled();
      expect(mockClaimChapterOffline).not.toHaveBeenCalled();
    });
  });
});
