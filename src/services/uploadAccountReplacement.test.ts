// Real singleton adapter + worker integration; account queue and DB writes are mocked.
// Does not exercise AuthSessionProvider, UI switching, actual DB filters or persistence.
import * as FileSystem from 'expo-file-system/legacy';
import { waitFor } from '@testing-library/react-native';
import { resetFileSystemMock } from '../test/mocks/expo-file-system';
import type { PendingRecording } from '../types/db/types';
import type { PendingUploadChapter } from '../db/queries';
import type { UploadSessionEvent } from './syncEvents';
import { authToken } from './authToken';
import {
  __resetRecordingSyncForTests,
  registerRecordingUploadWorker,
} from './recordingSync';
import {
  getUploadOrchestrator,
  setChapterUploadWorker,
  startUploadOrchestrator,
  stopUploadOrchestrator,
  sessionRetryDelayMs,
} from './uploadOrchestrator';

type ConnectivityListener = (
  online: boolean,
  wifi: boolean,
  cellular?: boolean,
  type?: string,
) => void;
const mockListeners = new Set<ConnectivityListener>();
const mockGetPendingChapters = jest.fn();
const mockGetPendingRecordings = jest.fn();
const mockUploadVerseAudio = jest.fn();
const mockMarkUploaded = jest.fn();
const mockSetStatus = jest.fn();
const mockEmit = jest.fn();
let mockActiveUserId = '10';
let mockPausedUntil: number | null = null;

jest.mock('../db/queries', () => ({
  getPendingUploadChapters: () => mockGetPendingChapters(),
}));
jest.mock('../db/repositories/heldRecordingsRepository', () => ({
  reconcileHeldRecordings: async () => ({ held: 0, released: 0 }),
}));
jest.mock('../db/repository', () => ({
  getPendingRecordings: (...args: unknown[]) =>
    mockGetPendingRecordings(...args),
  getPendingRecordingDeletions: async () => [],
  clearRecordingDeletion: jest.fn(),
  getLatestVersionToken: async () => undefined,
  setRecordingSyncStatus: (...args: unknown[]) => mockSetStatus(...args),
  markRecordingUploaded: (...args: unknown[]) => mockMarkUploaded(...args),
  markRecordingAndChapterConflicted: jest.fn(),
  markRecordingFailed: jest.fn(),
  updateRecordingVersionToken: jest.fn(),
  raiseVerseVersionToken: jest.fn(),
}));
jest.mock('./api', () => ({
  FluentAPI: {
    uploadVerseAudio: (...args: unknown[]) => mockUploadVerseAudio(...args),
    deleteVerseAudioTake: jest.fn(),
  },
}));
jest.mock('./connectivity', () => ({
  subscribeToConnectivity: (listener: ConnectivityListener) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
  getConnectivitySnapshot: async () => ({
    isOnline: true,
    isWifi: true,
    connectionType: 'wifi',
  }),
}));
jest.mock('./userPreferences', () => ({
  getUploadOverCellular: () => false,
  subscribeToPreference: () => () => undefined,
}));
jest.mock('./storage', () => ({
  getActiveUserId: () => mockActiveUserId,
  getSyncPausedUntilMs: () => mockPausedUntil,
  setSyncPausedUntilMs: (value: number | null) => {
    mockPausedUntil = value;
  },
  setReauthRequired: jest.fn(),
}));
jest.mock('./sync', () => ({
  syncPendingChapterClaimsForUser: async () => undefined,
  syncPendingStageAdvancesForUser: async () => ({
    synced: 0,
    dropped: 0,
    failed: 0,
  }),
}));
jest.mock('./keychain', () => ({
  getCredentials: async (id: string) => ({ token: `owner-${id}-token` }),
}));
jest.mock('./syncEvents', () => ({
  emitUploadSessionEvent: (event: UploadSessionEvent) => mockEmit(event),
  emitAuthReauthRequired: jest.fn(),
  onSyncComplete: () => () => undefined,
}));
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const oldChapter = { bookId: 1, chapterNumber: 1 };
const freshChapter = { bookId: 2, chapterNumber: 1 };
const recordings: PendingRecording[] = [
  {
    id: 'old-owner-take',
    bibleTextId: 42,
    localFilePath: 'file:///mock-document/old.m4a',
    durationMs: 1000,
    ...oldChapter,
    projectUnitId: 12,
    recordedByUserId: 10,
    granularity: 'verse',
    startChapter: null,
    startVerse: null,
    endChapter: null,
    endVerse: null,
    isCanonical: false,
    isSelected: true,
  },
  {
    id: 'fresh-owner-take',
    bibleTextId: 43,
    localFilePath: 'file:///mock-document/fresh.m4a',
    durationMs: 1200,
    ...freshChapter,
    projectUnitId: 13,
    recordedByUserId: 12,
    granularity: 'verse',
    startChapter: null,
    startVerse: null,
    endChapter: null,
    endVerse: null,
    isCanonical: false,
    isSelected: true,
  },
];
const uploaded = new Set<string>();
type Timer = { callback: () => void; delay: number; cancelled: boolean };
let timers: Timer[] = [];
const schedule = (callback: () => void, delay: number) => {
  const timer = { callback, delay, cancelled: false };
  timers.push(timer);
  return () => {
    timer.cancelled = true;
  };
};
const connect = () => {
  for (const listener of [...mockListeners])
    listener(true, true, false, 'wifi');
};
const flush = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};
const response = (bibleTextId: number) => ({
  id: bibleTextId,
  projectUnitId: bibleTextId === 42 ? 12 : 13,
  bibleTextId,
  uploadedBy: bibleTextId === 42 ? 10 : 12,
  versionToken: 1,
  conflictStatus: 'clean',
});

beforeEach(async () => {
  stopUploadOrchestrator();
  __resetRecordingSyncForTests();
  jest.clearAllMocks();
  mockListeners.clear();
  resetFileSystemMock();
  mockActiveUserId = '10';
  mockPausedUntil = null;
  uploaded.clear();
  timers = [];
  authToken.set('active-10-token');
  for (const recording of recordings)
    await FileSystem.writeAsStringAsync(recording.localFilePath, 'fake-audio');
  mockGetPendingChapters.mockImplementation(async () => {
    const take = recordings.find(
      recording => String(recording.recordedByUserId) === mockActiveUserId,
    )!;
    return uploaded.has(take.id)
      ? []
      : [{ bookId: take.bookId, chapterNumber: take.chapterNumber }];
  });
  mockGetPendingRecordings.mockImplementation(
    async (chapter?: PendingUploadChapter) =>
      recordings.filter(
        recording =>
          !uploaded.has(recording.id) &&
          (!chapter ||
            (recording.bookId === chapter.bookId &&
              recording.chapterNumber === chapter.chapterNumber)),
      ),
  );
  mockMarkUploaded.mockImplementation(async (id: string) => {
    uploaded.add(id);
  });
  mockSetStatus.mockResolvedValue(undefined);
  mockUploadVerseAudio.mockImplementation(
    async (input: { bibleTextId: number }) => response(input.bibleTextId),
  );
  registerRecordingUploadWorker();
});

afterEach(async () => {
  stopUploadOrchestrator();
  await flush();
  setChapterUploadWorker(null);
  __resetRecordingSyncForTests();
  authToken.set(null);
});

describe('real upload adapter and recording worker across account replacement', () => {
  it('persists an accepted old-owner take and drains the fresh account queue with its owner token after replacement', async () => {
    let acceptOld!: (value: ReturnType<typeof response>) => void;
    const oldRequest = new Promise<ReturnType<typeof response>>(resolve => {
      acceptOld = resolve;
    });
    mockUploadVerseAudio.mockImplementation((input: { bibleTextId: number }) =>
      input.bibleTextId === 42
        ? oldRequest
        : Promise.resolve(response(input.bibleTextId)),
    );
    const old = startUploadOrchestrator({ schedule });
    try {
      connect();
      await waitFor(() =>
        expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1),
      );
      mockActiveUserId = '12';
      authToken.set('active-12-token');
      const fresh = startUploadOrchestrator({ schedule });
      expect(fresh).not.toBe(old);
      expect(getUploadOrchestrator()).toBe(fresh);
      connect();
      await flush();
      expect(mockUploadVerseAudio).toHaveBeenCalledTimes(1);

      acceptOld(response(42));
      await waitFor(() =>
        expect(
          timers.some(
            timer => !timer.cancelled && timer.delay === sessionRetryDelayMs(1),
          ),
        ).toBe(true),
      );
      expect(uploaded.has('old-owner-take')).toBe(true);
      expect(uploaded.has('fresh-owner-take')).toBe(false);
      expect(
        mockEmit.mock.calls.some(call => call[0].type === 'complete'),
      ).toBe(false);
      const retry = timers.find(
        timer => !timer.cancelled && timer.delay === sessionRetryDelayMs(1),
      )!;
      retry.cancelled = true;
      retry.callback();
      await waitFor(() => expect(uploaded.has('fresh-owner-take')).toBe(true));
      await flush();
      expect(
        mockUploadVerseAudio.mock.calls.map(call => [
          call[0].bibleTextId,
          call[1],
        ]),
      ).toEqual([
        [42, 'owner-10-token'],
        [43, 'owner-12-token'],
      ]);
      expect(mockMarkUploaded.mock.calls.map(call => call[0])).toEqual([
        'old-owner-take',
        'fresh-owner-take',
      ]);
      expect(
        mockEmit.mock.calls.filter(call => call[0].type === 'complete'),
      ).toHaveLength(1);
      expect(fresh.getSnapshot()).toMatchObject({
        phase: 'idle',
        completedChapters: 0,
        totalChapters: 0,
      });
    } finally {
      acceptOld(response(42));
    }
  });

  it('replaces a singleton blocked on the old account queue read without starting its worker later', async () => {
    let finishOldRead!: (chapters: PendingUploadChapter[]) => void;
    const oldRead = new Promise<PendingUploadChapter[]>(resolve => {
      finishOldRead = resolve;
    });
    mockGetPendingChapters.mockImplementationOnce(() => oldRead);
    startUploadOrchestrator({ schedule });
    try {
      connect();
      await waitFor(() =>
        expect(mockGetPendingChapters).toHaveBeenCalledTimes(1),
      );
      mockActiveUserId = '12';
      authToken.set('active-12-token');
      const fresh = startUploadOrchestrator({ schedule });
      connect();
      await waitFor(() => expect(uploaded.has('fresh-owner-take')).toBe(true));
      finishOldRead([oldChapter]);
      await flush();
      expect(uploaded.has('old-owner-take')).toBe(false);
      expect(
        mockUploadVerseAudio.mock.calls.map(call => [
          call[0].bibleTextId,
          call[1],
        ]),
      ).toEqual([[43, 'owner-12-token']]);
      expect(mockSetStatus).not.toHaveBeenCalledWith(
        'old-owner-take',
        'uploading',
      );
      expect(
        mockEmit.mock.calls.filter(call => call[0].type === 'complete'),
      ).toHaveLength(1);
      expect(fresh.getSnapshot().phase).toBe('idle');
    } finally {
      finishOldRead([]);
    }
  });
});
