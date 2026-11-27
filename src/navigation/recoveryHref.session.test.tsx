import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import {
  getChapterAssignmentById,
  getChapterRouteNames,
  getPericopeForVerse,
} from '../db/queries';
import { useRecordSession } from '../hooks/useRecordSession';
import type { DraftingUnit } from '../services/draftingUnitPreference';
import type { PausedTakeMarker } from '../services/pausedTakes';
import type { ChapterAssignmentData } from '../types/db/types';
import { readPassageRecovery, type PassageRecovery } from './passageRecovery';
import { resolveRecoveryHref } from './recoveryHref';
import {
  classifyVerseDetailLink,
  openVerseDetailRecovery,
} from './verseDetailLink';

/**
 * #914: follows a stored marker from Resume into the recorder the Next
 * passage page builds, through the real session: the href, the recovery the
 * page reads from it, and `useRecordSession` with its own text-id and unit
 * lookups. The page tests pin that the page hands the session these args.
 */

const mockRecordingStart = jest.fn();
const mockRecordingStop = jest.fn();
const mockPlay = jest.fn();
const mockFileExists = jest.fn();
const mockDeleteFile = jest.fn();
const mockPersistTake = jest.fn();
const mockUpsertPausedTake = jest.fn();
const mockPausedMarkers: PausedTakeMarker[] = [];
const mockRecordingState = {
  status: 'idle' as 'idle' | 'recording' | 'paused',
};
const mockClearPausedTake = jest.fn((sessionKey: string) => {
  const index = mockPausedMarkers.findIndex(m => m.sessionKey === sessionKey);
  if (index >= 0) mockPausedMarkers.splice(index, 1);
});

jest.mock('../hooks/useVerseAudio', () => {
  const actual = jest.requireActual('../hooks/useVerseAudio');
  return {
    ...actual,
    // The real hook; only the file commit is swapped for a spy.
    useVerseAudio: (args: object) =>
      actual.useVerseAudio({ ...args, persistTake: mockPersistTake }),
  };
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
    play: mockPlay,
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
  upsertPausedTake: (marker: PausedTakeMarker) => mockUpsertPausedTake(marker),
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
  // Verse v of Mark 14 is text 20 + v.
  getBibleTextId: jest.fn(
    async (_bible: number, _book: number, _chapter: number, verse: number) =>
      20 + verse,
  ),
  getPericopeForVerse: jest.fn(async () => ({
    pericopeTitle: 'The Last Supper',
    verses: [22, 23, 24, 25].map(verseNumber => ({
      chapterNumber: 14,
      verseNumber,
    })),
  })),
}));

const mockTakesForVerse = jest.fn();
jest.mock('../db/repository', () => ({
  addRecordingTake: jest.fn(),
  getTakesForVerse: (...args: unknown[]) => mockTakesForVerse(...args),
  getAllTakesForVerse: jest.fn().mockResolvedValue([]),
  verseHasMultipleRecorders: jest.fn().mockResolvedValue(false),
  selectRecordingTake: jest.fn(),
  claimChapterOffline: jest.fn(),
  getProjectPericopeSetId: jest.fn().mockResolvedValue(3),
}));

const mockAssignment = getChapterAssignmentById as jest.Mock;
const mockNames = getChapterRouteNames as jest.Mock;

const chapter = {
  id: 5,
  projectId: 9,
  projectUnitId: 3,
  bibleId: 4,
  bookId: 41,
  bookName: 'Mark',
  chapterNumber: 14,
  assignedUserId: 7,
  status: 'draft',
} as unknown as ChapterAssignmentData;

const SAVED = 'file:///paused.aac';
const marker = (fields: Partial<PausedTakeMarker>): PausedTakeMarker => ({
  sessionKey: '5:23',
  segments: [SAVED],
  elapsedMs: 4000,
  startedAt: '2026-11-01T10:00:00Z',
  chapterAssignmentId: 5,
  verseNumber: 23,
  ...fields,
});
const verseCapture = {
  bibleTextId: 43,
  granularity: 'verse' as const,
  startChapter: 14,
  startVerse: 23,
  endChapter: 14,
  endVerse: 23,
};
const passageCapture = {
  bibleTextId: 42,
  granularity: 'pericope' as const,
  startChapter: 14,
  startVerse: 22,
  endChapter: 14,
  endVerse: 25,
};

/** What Resume opens, and the recovery the passage page reads from it. */
async function recover(): Promise<PassageRecovery | null> {
  const result = await resolveRecoveryHref(mockPausedMarkers[0]!);
  if (result.status !== 'open') return null;
  const params = result.href.params as Record<string, string | undefined>;
  return readPassageRecovery(
    {
      chapterId: Number(params.chapterId),
      sessionKey: params.recoverSessionKey,
      verse: Number(params.recoverVerse),
    },
    7,
  );
}

/**
 * The session as the page builds it: the sheet records in the recovered unit
 * (verse by verse in a chapter without pericopes) and the recorder keys it
 * on the recovered verse.
 */
function renderSession(
  recovery: PassageRecovery,
  wholeChapter = false,
  userId = 7,
) {
  const draftingUnit: DraftingUnit = wholeChapter ? 'verse' : recovery.unit;
  return renderHook(() =>
    useRecordSession({
      chapterData: chapter,
      userId,
      selectedVerse: recovery.verse,
      versesLength: 72,
      draftingUnit,
    }),
  );
}

async function resumeAndFinish(
  result: Awaited<ReturnType<typeof renderSession>>['result'],
) {
  await act(async () => {
    await result.current.verseAudio.resume();
  });
  expect(result.current.verseAudio.state).toBe('recording');
  await act(async () => {
    await result.current.verseAudio.stop();
  });
}

describe('resuming a saved take in Next (#914)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPausedMarkers.splice(0, mockPausedMarkers.length);
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
    mockTakesForVerse.mockResolvedValue([]);
    mockPersistTake.mockResolvedValue({
      id: 'rec_new',
      localFilePath: '/recordings/rec_new.m4a',
    });
    mockAssignment.mockResolvedValue(chapter);
    mockNames.mockResolvedValue({
      projectName: 'Mark Telugu',
      milestoneName: 'Gospels Phase 1',
      language: 'Telugu',
    });
  });

  it.each([
    {
      name: 'a verse take, whatever the drafting setting',
      stored: marker({ capture: verseCapture }),
      wholeChapter: false,
      unit: 'verse',
      saved: verseCapture,
    },
    {
      name: 'a passage take paused after where the passage starts',
      stored: marker({ capture: passageCapture }),
      wholeChapter: false,
      unit: 'pericope',
      saved: passageCapture,
    },
    {
      name: 'a passage take whose chapter has no pericopes now',
      stored: marker({ capture: passageCapture }),
      wholeChapter: true,
      unit: 'pericope',
      saved: passageCapture,
    },
    {
      name: 'a marker from before captures, as a take on its verse',
      stored: marker({}),
      wholeChapter: false,
      unit: 'verse',
      saved: verseCapture,
    },
  ])(
    'brings back $name, and Resume and Finish save it',
    async ({ stored, wholeChapter, unit, saved }) => {
      mockPausedMarkers.push(stored, marker({ sessionKey: '5:24' }));
      const recovery = await recover();
      expect(recovery).toEqual({ verse: 23, unit });

      const { result } = await renderSession(recovery!, wholeChapter);

      await waitFor(() =>
        expect(result.current.verseAudio.state).toBe('paused'),
      );
      expect(result.current.verseAudio.recoveredElapsedMs).toBe(4000);
      expect(mockClearPausedTake).not.toHaveBeenCalled();
      expect(mockDeleteFile).not.toHaveBeenCalled();

      await resumeAndFinish(result);

      expect(mockPersistTake).toHaveBeenCalledTimes(1);
      expect(mockPersistTake).toHaveBeenCalledWith(
        expect.objectContaining({
          ...saved,
          tempUris: [SAVED, 'file:///tmp/take.m4a'],
          durationMs: 4500,
        }),
      );
      // Only this take's marker goes; the other paused take stays.
      expect(mockClearPausedTake).toHaveBeenCalledTimes(1);
      expect(mockClearPausedTake).toHaveBeenCalledWith('5:23');
      expect(mockPausedMarkers.map(m => m.sessionKey)).toEqual(['5:24']);
      expect(result.current.verseAudio.state).toBe('recorded');
    },
  );

  it('finishes an old verse-detail recovery link as the saved passage take', async () => {
    const stored = marker({ capture: passageCapture });
    mockPausedMarkers.push(stored);
    const pericope = getPericopeForVerse as jest.Mock;
    pericope.mockClear();

    const classified = classifyVerseDetailLink({
      chapterId: '5',
      chapterName: 'Mark 14',
      projectName: 'wrong project',
      language: 'wrong language',
      recoverSessionKey: stored.sessionKey,
      recoverVerse: String(stored.verseNumber),
    });
    expect(classified).toEqual({
      kind: 'recover',
      chapterId: 5,
      verse: 23,
      sessionKey: '5:23',
    });
    if (classified.kind !== 'recover') return;

    mockNames.mockResolvedValueOnce(null);
    await expect(openVerseDetailRecovery(classified)).resolves.toEqual({
      kind: 'unread',
    });
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockPausedMarkers).toEqual([stored]);

    const direct = await resolveRecoveryHref(stored);
    const link = await openVerseDetailRecovery(classified);
    expect(pericope).not.toHaveBeenCalled();
    expect(direct.status).toBe('open');
    expect(link.kind).toBe('passage');
    if (direct.status !== 'open' || link.kind !== 'passage') return;
    expect(link.href).toEqual(direct.href);
    expect(link.href.params).toMatchObject({
      anchorVerse: '23',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
      projectName: 'Mark Telugu',
    });

    const params = link.href.params as Record<string, string | undefined>;
    const recovery = readPassageRecovery(
      {
        chapterId: Number(params.chapterId),
        sessionKey: params.recoverSessionKey,
        verse: Number(params.recoverVerse),
      },
      7,
    );
    expect(recovery).toEqual({ verse: 23, unit: 'pericope' });
    const { result } = await renderSession(recovery!);
    await waitFor(() => expect(result.current.verseAudio.state).toBe('paused'));
    await resumeAndFinish(result);
    expect(mockPersistTake).toHaveBeenCalledWith(
      expect.objectContaining({
        ...passageCapture,
        tempUris: [SAVED, 'file:///tmp/take.m4a'],
      }),
    );
  });

  it('finishes a capture-less old link as a verse take on the saved verse', async () => {
    const stored = JSON.parse(
      '{"sessionKey":"5:23","segments":["file:///paused.aac"],"elapsedMs":4000,' +
        '"startedAt":"2026-08-01T10:00:00Z","chapterAssignmentId":5,"verseNumber":23}',
    );
    mockPausedMarkers.push(stored);
    const classified = classifyVerseDetailLink({
      chapterId: '5',
      recoverSessionKey: '5:23',
      recoverVerse: '23',
    });
    if (classified.kind !== 'recover') throw new Error('expected recover');
    const link = await openVerseDetailRecovery(classified);
    expect(link.kind).toBe('passage');
    if (link.kind !== 'passage') return;
    expect(link.href.params).toMatchObject({
      anchorVerse: '23',
      verse: '23',
      recoverVerse: '23',
    });
    const recovery = readPassageRecovery(
      { chapterId: 5, sessionKey: '5:23', verse: 23 },
      7,
    );
    expect(recovery).toEqual({ verse: 23, unit: 'verse' });
    const { result } = await renderSession(recovery!);
    await waitFor(() => expect(result.current.verseAudio.state).toBe('paused'));
    await resumeAndFinish(result);
    expect(mockPersistTake).toHaveBeenCalledWith(
      expect.objectContaining({
        granularity: 'verse',
        startVerse: 23,
        endVerse: 23,
      }),
    );
  });

  it('keeps a verse take a verse take after a failed names read, then opens it', async () => {
    mockPausedMarkers.push(marker({ capture: verseCapture }));
    mockNames.mockResolvedValueOnce(null);

    await expect(recover()).resolves.toBeNull();
    expect(mockPausedMarkers).toHaveLength(1);
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();

    const recovery = await recover();
    expect(recovery).toEqual({ verse: 23, unit: 'verse' });
    const { result } = await renderSession(recovery!);
    await waitFor(() => expect(result.current.verseAudio.state).toBe('paused'));
    await resumeAndFinish(result);
    expect(mockPersistTake).toHaveBeenCalledWith(
      expect.objectContaining({ ...verseCapture }),
    );
  });

  it('keeps the take paused, and its marker, when Finish fails to save', async () => {
    mockPausedMarkers.push(marker({ capture: passageCapture }));
    mockPersistTake.mockRejectedValueOnce(new Error('disk full'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const recovery = await recover();
    const { result } = await renderSession(recovery!);
    await waitFor(() => expect(result.current.verseAudio.state).toBe('paused'));

    await resumeAndFinish(result);

    expect(result.current.verseAudio.state).toBe('paused');
    expect(mockClearPausedTake).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockUpsertPausedTake).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: '5:23',
        segments: [SAVED, 'file:///tmp/take.m4a'],
        capture: passageCapture,
        userId: 7,
      }),
    );
    alert.mockRestore();
  });

  it('brings the same take back again after leaving it, without a second capture', async () => {
    mockPausedMarkers.push(marker({ capture: passageCapture }));
    const recovery = await recover();
    const first = await renderSession(recovery!);
    await waitFor(() =>
      expect(first.result.current.verseAudio.state).toBe('paused'),
    );
    await first.unmount();

    const again = await renderSession((await recover())!);
    await waitFor(() =>
      expect(again.result.current.verseAudio.state).toBe('paused'),
    );
    expect(again.result.current.verseAudio.recoveredElapsedMs).toBe(4000);
    expect(mockRecordingStart).not.toHaveBeenCalled();
    expect(mockUpsertPausedTake).not.toHaveBeenCalled();
    expect(mockPausedMarkers).toHaveLength(1);
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('plays the saved take back through the take player', async () => {
    mockPausedMarkers.push(marker({ capture: verseCapture }));
    const { result } = await renderSession((await recover())!);
    await waitFor(() => expect(result.current.verseAudio.state).toBe('paused'));
    await resumeAndFinish(result);

    await act(async () => {
      await result.current.verseAudio.playTake({
        id: 'rec_new',
        localFilePath: '/recordings/rec_new.m4a',
      } as Parameters<typeof result.current.verseAudio.playTake>[0]);
    });

    expect(mockPlay).toHaveBeenCalledWith('/recordings/rec_new.m4a');
    expect(result.current.verseAudio.errorMessage).toBeNull();
  });

  describe("another account's paused take", () => {
    beforeEach(() => {
      mockPausedMarkers.push(marker({ capture: verseCapture, userId: 8 }));
    });

    it("isn't opened for this account", async () => {
      await expect(recover()).resolves.toBeNull();
    });

    it("isn't recovered, cleared or recorded over on its verse", async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { result } = await renderSession({ verse: 23, unit: 'verse' });
      await waitFor(() => expect(result.current.captureBibleTextId).toBe(43));
      await act(async () => {});
      expect(result.current.verseAudio.state).toBe('idle');

      await act(async () => {
        await result.current.verseAudio.start();
      });

      expect(mockRecordingStart).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith(
        'Audio error',
        expect.stringContaining('Another account'),
      );
      expect(mockUpsertPausedTake).not.toHaveBeenCalled();
      expect(mockClearPausedTake).not.toHaveBeenCalled();
      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(mockPausedMarkers).toEqual([
        marker({ capture: verseCapture, userId: 8 }),
      ]);
      alert.mockRestore();
    });

    it('comes back for the account that paused it', async () => {
      const { result } = await renderSession(
        { verse: 23, unit: 'verse' },
        false,
        8,
      );
      await waitFor(() =>
        expect(result.current.verseAudio.state).toBe('paused'),
      );
    });
  });

  it('opens a marker from before owners were kept for whoever is signed in', async () => {
    mockPausedMarkers.push(marker({ capture: verseCapture }));
    const recovery = await recover();
    expect(recovery).toEqual({ verse: 23, unit: 'verse' });
  });
});
