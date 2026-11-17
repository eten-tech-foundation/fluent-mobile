import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  getChapterAssignmentById,
  getChapterRouteNames,
  getPericopeForVerse,
} from '../db/queries';
import { useVerseAudio } from '../hooks/useVerseAudio';
import { getDraftingUnit } from '../services/draftingUnitPreference';
import type { PausedTakeMarker } from '../services/pausedTakes';
import type { RecordingUnitCapture } from '../utils/recordingRange';
import { resolveRecoveryHref } from './recoveryHref';

/**
 * #899: a failed pericope read must not turn a paused verse into another
 * session. `recoveryHref.test.ts` pins the routing; this one follows the
 * route's params into the recorder the opened screen builds, and checks the
 * saved take is the one that comes back, with Resume and Finish working.
 */

const mockRecordingStart = jest.fn();
const mockRecordingStop = jest.fn();
const mockFileExists = jest.fn();
const mockDeleteFile = jest.fn();
const mockPausedMarkers: PausedTakeMarker[] = [];
const mockRecordingState = {
  status: 'idle' as 'idle' | 'recording' | 'paused',
};
const mockClearPausedTake = jest.fn((sessionKey: string) => {
  const index = mockPausedMarkers.findIndex(m => m.sessionKey === sessionKey);
  if (index >= 0) mockPausedMarkers.splice(index, 1);
});

jest.mock('../hooks/useRecordingEngine', () => ({
  useRecordingEngine: () => ({
    start: mockRecordingStart,
    stop: mockRecordingStop,
    pause: jest.fn(),
    resume: jest.fn(),
    get status() {
      return mockRecordingState.status;
    },
  }),
}));

jest.mock('../hooks/usePlaybackEngine', () => ({
  usePlaybackEngine: () => ({
    play: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    load: jest.fn(),
    seek: jest.fn(),
    status: 'idle',
    positionMs: 0,
    durationMs: 0,
  }),
}));

jest.mock('../utils/audioStorage', () => ({
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  ensureRecordingsDir: jest.fn(),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  fileSize: jest.fn().mockResolvedValue(128),
  recordingPath: jest.fn((id: string) => `/recordings/${id}.m4a`),
}));

jest.mock('../services/connectivity', () => ({
  getConnectivitySnapshot: jest.fn().mockResolvedValue({
    isOnline: true,
    isWifi: true,
    isCellular: false,
    connectionType: 'wifi',
  }),
}));

jest.mock('../services/pausedTakes', () => ({
  clearPausedTake: (sessionKey: string) => mockClearPausedTake(sessionKey),
  isPausedTakeOrphaned: (marker: {
    chapterAssignmentId?: number;
    verseNumber?: number;
  }) =>
    marker.chapterAssignmentId === undefined ||
    marker.verseNumber === undefined,
  listPausedTakes: () => mockPausedMarkers,
  upsertPausedTake: jest.fn(),
}));

jest.mock('../services/recordingTakeDeletion', () => ({
  deleteRecordingTakeWithUploadState: jest.fn(),
}));
jest.mock('../services/uploadOrchestrator', () => ({
  notifyPendingUploads: jest.fn(),
}));
jest.mock('../services/chapterClaimSync', () => ({
  syncChapterClaim: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: jest.fn(),
  getChapterRouteNames: jest.fn(),
  getPericopeForVerse: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  addRecordingTake: jest.fn(),
  deleteRecordingTake: jest.fn(),
  getTakesForVerse: jest.fn().mockResolvedValue([]),
  getAllTakesForVerse: jest.fn().mockResolvedValue([]),
  verseHasMultipleRecorders: jest.fn().mockResolvedValue(false),
  selectRecordingTake: jest.fn(),
  claimChapterOffline: jest.fn(),
  getProjectPericopeSetId: jest.fn().mockResolvedValue(3),
}));

jest.mock('../services/draftingUnitPreference', () => ({
  getDraftingUnit: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => '7',
}));

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockNames = getChapterRouteNames as jest.Mock;
const mockPericope = getPericopeForVerse as jest.Mock;
const mockUnit = getDraftingUnit as jest.Mock;

const PASSAGE_VERSES = [22, 23, 24, 25].map(verseNumber => ({
  chapterNumber: 14,
  verseNumber,
}));

/** Verse 23 was paused inside a passage that starts at 22. */
const marker: PausedTakeMarker = {
  sessionKey: '5:23',
  segments: ['file:///paused.aac'],
  elapsedMs: 4000,
  startedAt: '2026-11-01T10:00:00Z',
  chapterAssignmentId: 5,
  verseNumber: 23,
  capture: {
    bibleTextId: 43,
    granularity: 'verse',
    startChapter: 14,
    startVerse: 23,
    endChapter: 14,
    endVerse: 23,
  },
};

describe('resuming a paused verse take after a failed pericope read (#899)', () => {
  const persistTake = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPausedMarkers.splice(0, mockPausedMarkers.length, {
      ...marker,
      segments: [...marker.segments],
    });
    mockRecordingState.status = 'idle';
    mockRecordingStart.mockImplementation(async () => {
      mockRecordingState.status = 'recording';
    });
    mockRecordingStop.mockImplementation(async () => {
      mockRecordingState.status = 'idle';
      return { uri: 'file:///tmp/take.m4a', durationMs: 500 };
    });
    mockFileExists.mockResolvedValue(true);
    mockDeleteFile.mockResolvedValue(undefined);
    persistTake.mockResolvedValue({
      id: 'rec_new',
      localFilePath: '/recordings/rec_new.m4a',
    });
    mockAssignment.mockResolvedValue({
      id: 5,
      projectId: 9,
      projectUnitId: 3,
      bookId: 41,
      bookName: 'Mark',
      chapterNumber: 14,
    });
    mockNames.mockResolvedValue({
      projectName: 'Mark Telugu',
      milestoneName: 'Gospels Phase 1',
      language: 'Telugu',
    });
    // The project records passages.
    mockUnit.mockReturnValue('pericope');
    mockPericope.mockResolvedValue({ verses: PASSAGE_VERSES });
  });

  it('opens the saved verse session, which Resume and Finish carry through', async () => {
    // Recovery's own read fails; the screen it opens reads fine.
    mockPericope.mockImplementationOnce(async (...args: unknown[]) => {
      (args[4] as (() => void) | undefined)?.();
      return null;
    });

    const href = await resolveRecoveryHref(marker, 'next');

    expect(href).toMatchObject({
      pathname: '/(app)/(stack)/verse-detail',
      params: {
        chapterId: '5',
        recoverSessionKey: '5:23',
        recoverVerse: '23',
      },
    });
    const { chapterId, recoverVerse } = (
      href as { params: Record<string, string> }
    ).params;

    // The drafting screen opens on that chapter and verse, and its own
    // pericope read succeeds, so it records the passage as a unit.
    const group = await getPericopeForVerse(41, 14, Number(recoverVerse), 3);
    const recordingUnit: RecordingUnitCapture = {
      granularity: 'pericope',
      startChapter: 14,
      startVerse: 22,
      endChapter: 14,
      endVerse: 25,
      anchorBibleTextId: 42,
      coveredViews: (group?.verses ?? []).map(
        (v: (typeof PASSAGE_VERSES)[0]) => ({
          bibleTextId: 20 + v.verseNumber,
          chapterNumber: v.chapterNumber,
          verseNumber: v.verseNumber,
        }),
      ),
    };
    // Stable across renders, as the screen's are: a new function each render
    // would re-run the hook's take load forever.
    const loadTakes = jest.fn().mockResolvedValue([]);
    const deleteTake = jest.fn();
    const selectTake = jest.fn();
    const countTakesAtView = async () => 0;
    const { result } = renderHook(() =>
      useVerseAudio({
        bibleTextId: 43,
        chapterAssignmentId: Number(chapterId),
        chapterNumber: 14,
        verseNumber: Number(recoverVerse),
        draftingUnit: 'pericope',
        recordingUnit,
        userId: null,
        loadTakes,
        persistTake,
        deleteTake,
        selectTake,
        countTakesAtView,
      }),
    );

    // The paused verse take comes back, its marker and audio untouched.
    await waitFor(() => expect(result.current.state).toBe('paused'));
    expect(result.current.recoveredElapsedMs).toBe(4000);
    expect(mockPausedMarkers).toEqual([marker]);
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();

    // Resume records on, Finish saves the saved audio plus the new segment.
    await act(async () => {
      await result.current.resume();
    });
    expect(result.current.state).toBe('recording');
    await act(async () => {
      await result.current.stop();
    });

    expect(persistTake).toHaveBeenCalledWith(
      expect.objectContaining({
        tempUris: ['file:///paused.aac', 'file:///tmp/take.m4a'],
        durationMs: 4500,
        bibleTextId: 43,
        granularity: 'verse',
        startChapter: 14,
        startVerse: 23,
        endChapter: 14,
        endVerse: 23,
      }),
    );
    expect(mockClearPausedTake).toHaveBeenCalledWith('5:23');
    expect(result.current.state).toBe('recorded');
  });
});
