import { ApiError } from '../types/api/errors';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import {
  getChapterAssignmentPullRevision,
  markChapterCompleteConfirmed,
} from '../utils/chapterCompletionSyncGuard';
import { AuthError } from './authError';
import {
  __resetFullSyncSingleFlightForTests,
  BIBLE_TEXT_CURSOR_OVERLAP_MS,
  BIBLE_TEXT_FULL_RECONCILE_BUDGET,
  BIBLE_TEXT_FULL_RECONCILE_MAX_AGE_MS,
  syncAllUsers,
  syncBibleTexts,
  syncBibleTextsForChapters,
  syncChapterAssignments,
  syncMasterData,
  syncPendingChapterClaimsForUser,
  syncProjects,
} from './sync';

/** Incremental text requests rewind the chapter cursor (#886). */
const overlapped = (iso: string): string =>
  new Date(Date.parse(iso) - BIBLE_TEXT_CURSOR_OVERLAP_MS).toISOString();
import { getCredentials } from './keychain';
import {
  clearSyncError,
  getActiveUserId,
  getKnownUserIds,
  getLastAssignmentSyncAt,
  getLastSyncedAt,
  getUserLastSyncedAt,
  setSyncCount,
  setSyncError,
  isBibleTextsServerIdRemapPending,
  clearBibleTextsServerIdRemapPending,
  getMasterDataLastSyncedAt,
  setMasterDataLastSyncedAt,
  getMasterDataUpdatedAt,
  setMasterDataUpdatedAt,
  setReauthRequired,
} from './storage';
import * as syncEvents from './syncEvents';
import { getDatabase } from '../db/db';
import {
  getBibleTextAbsencesForBible,
  getChaptersToSync,
  getRecordingLinkedChaptersToSync,
  clearBibleTextAbsences,
  insertBibleTexts,
  recordBibleTextAbsences,
  insertChapterAssignmentSyncData,
  insertMasterData,
  insertProjects,
  insertUserProjects,
  reconcileUserMilestones,
  reconcileUserProjects,
  ensureUserProjectMembership,
} from '../db/repository';
import { getConnectivitySnapshot } from './connectivity';
import { syncPendingChapterClaims } from './chapterClaimSync';
import { syncPendingStageAdvances } from './stageAdvanceSync';
import {
  BIBLE_TEXT_PHASE,
  SYNC_PHASE_FIELDS,
  SYNC_PHASE_LOG_MESSAGE,
} from './syncPhaseTiming';

jest.mock('./connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
  SERVER_REACHABILITY_FRESH_MS: 5_000,
}));

jest.mock('./chapterClaimSync', () => ({
  syncPendingChapterClaims: jest.fn(),
  reconcilePendingClaimsAfterAssignmentPull: jest
    .fn()
    .mockResolvedValue({ conflicts: 0 }),
}));

jest.mock('./stageAdvanceSync', () => ({
  syncPendingStageAdvances: jest.fn().mockResolvedValue({
    synced: 0,
    dropped: 0,
    failed: 0,
  }),
}));

jest.mock('./authToken', () => ({
  authToken: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getLanguages: jest.fn().mockResolvedValue([]),
    getLanguage: jest.fn(),
    getBooks: jest.fn().mockResolvedValue([]),
    getBook: jest.fn(),
    getBibles: jest.fn().mockResolvedValue([]),
    getBible: jest.fn(),
    getUserByEmail: jest.fn(),
    getUserProjects: jest.fn(),
    getUserMilestones: jest.fn().mockResolvedValue([]),
    getChapterAssignments: jest.fn().mockResolvedValue({ data: [] }),
    getUserChapterAssignments: jest.fn().mockResolvedValue({
      assignedChapters: [],
      peerCheckChapters: [],
    }),
    getBibleTexts: jest.fn(),
    getPericopeSets: jest.fn().mockResolvedValue([]),
    getPericopeSet: jest.fn().mockResolvedValue({ status: 304, etag: null }),
    getSelfSettings: jest.fn().mockResolvedValue({
      settings: null,
      updatedAt: null,
    }),
    putSelfSettings: jest.fn().mockResolvedValue({
      settings: null,
      updatedAt: null,
    }),
  },
}));

jest.mock('./userOrgGrants', () => ({
  persistOrgGrantsFromUserResponse: jest.fn(),
  refreshUserOrgGrants: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./keychain', () => ({
  clearCredentials: jest.fn().mockResolvedValue(undefined),
  getCredentials: jest.fn(),
  getTempCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  clearTempCredentials: jest.fn(),
}));

let mockKvBatchDepth = 0;
jest.mock('./kvBatch', () => ({
  runKvBatchSync: jest.fn((fn: () => void) => {
    mockKvBatchDepth += 1;
    try {
      fn();
    } finally {
      mockKvBatchDepth -= 1;
    }
  }),
}));

jest.mock('./storage', () => ({
  KV_KEYS: {
    SYNC_COUNT_PROJECTS: 'sync_count_projects',
    SYNC_COUNT_CHAPTERS: 'sync_count_chapters',
    SYNC_COUNT_BIBLES: 'sync_count_bibles',
    SYNC_ERROR_USER: 'sync_error_user',
    SYNC_ERROR_MASTER_DATA: 'sync_error_master_data',
    SYNC_ERROR_PROJECTS: 'sync_error_projects',
    SYNC_ERROR_CHAPTER_ASSIGNMENTS: 'sync_error_chapter_assignments',
    SYNC_ERROR_CHAPTER_CLAIMS: 'sync_error_chapter_claims',
    SYNC_ERROR_PROJECT_UNITS: 'sync_error_project_units',
    SYNC_ERROR_BIBLE_TEXTS: 'sync_error_bible_texts',
    SYNC_ERROR_PREPARE_OFFLINE_BIBLE_TEXTS:
      'sync_error_prepare_offline_bible_texts',
  },
  getUserIdSync: jest.fn(),
  getActiveUserId: jest.fn(),
  getUserEmailSync: jest.fn(),
  getLastSyncedAt: jest.fn(),
  getLastAssignmentSyncAt: jest.fn(),
  getMasterDataLastSyncedAt: jest.fn().mockReturnValue(''),
  setMasterDataLastSyncedAt: jest.fn(),
  getMasterDataUpdatedAt: jest.fn().mockReturnValue(''),
  setMasterDataUpdatedAt: jest.fn(),
  getKnownUserIds: jest.fn(),
  getUserLastSyncedAt: jest.fn(),
  setUserLastSyncedAt: jest.fn(),
  // Test convenience only (#886): the real getter runs a one-time legacy
  // reconciliation (storage.test.ts); here it just follows the legacy mock.
  getUserBibleTextSyncedAt: jest.fn((userId: string) =>
    jest.requireMock('./storage').getUserLastSyncedAt(userId),
  ),
  setUserBibleTextSyncedAt: jest.fn(),
  getBibleTextChapterSyncedAt: jest.fn(() => '2026-01-01T00:00:00.000Z'),
  setBibleTextChapterSyncedAt: jest.fn(),
  getBibleTextChapterFullReconcileAt: jest.fn(() => null),
  setBibleTextChapterFullReconcileAt: jest.fn(),
  setUserSync: jest.fn(),
  setSyncCount: jest.fn(),
  setLastSyncedAt: jest.fn(),
  setLastAssignmentSyncAt: jest.fn(),
  setSyncError: jest.fn(),
  clearSyncError: jest.fn(),
  clearAllSyncErrors: jest.fn(),
  setReauthRequired: jest.fn(),
  isReauthRequired: jest.fn(),
  isBibleTextsServerIdRemapPending: jest.fn().mockReturnValue(false),
  clearBibleTextsServerIdRemapPending: jest.fn(),
  getPericopeBookVersion: jest.fn().mockReturnValue(''),
  setPericopeBookVersion: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  insertMasterData: jest.fn().mockResolvedValue(undefined),
  insertProjects: jest.fn().mockResolvedValue(undefined),
  insertUserProjects: jest.fn().mockResolvedValue(undefined),
  upsertProjectUnits: jest.fn().mockResolvedValue(undefined),
  reconcileUserMilestones: jest.fn().mockResolvedValue(undefined),
  reconcileUserProjects: jest.fn().mockResolvedValue(undefined),
  reconcileUserChapterWork: jest.fn().mockResolvedValue(undefined),
  ensureUserProjectMembership: jest.fn().mockResolvedValue(undefined),
  insertChapterAssignmentSyncData: jest.fn().mockResolvedValue({
    insertedCount: 1,
    skipped: [],
  }),
  insertBibleTexts: jest.fn().mockResolvedValue(undefined),
  recordBibleTextAbsences: jest.fn().mockResolvedValue(undefined),
  clearBibleTextAbsences: jest.fn().mockResolvedValue(undefined),
  getBibleTextAbsencesForBible: jest.fn().mockResolvedValue([]),
  getChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getMyWorkChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getRecordingLinkedChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getLocalProjectIds: jest.fn().mockResolvedValue([1]),
  hasLanguagesMissingIsoCode: jest.fn().mockResolvedValue(false),
  selectExistingIds: jest.fn(
    async (_table: string, ids: number[]) => new Set(ids),
  ),
  userHasLocalProjects: jest.fn().mockResolvedValue(true),
  userHasLocalChapterAssignments: jest.fn().mockResolvedValue(true),
  userNeedsAssigneeRepair: jest.fn().mockResolvedValue(false),
  insertUser: jest.fn().mockResolvedValue(undefined),
  insertPericopeSets: jest.fn().mockResolvedValue(undefined),
  getProjectPericopeSetId: jest.fn().mockResolvedValue(null),
  getChaptersNeedingPericopeSync: jest.fn().mockResolvedValue([]),
  upsertPericopeSet: jest.fn().mockResolvedValue(true),
}));

jest.mock('../db/db', () => ({
  getDatabase: jest.fn(() => ({
    execute: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
  })),
}));

// #886: drains skip the reachability probe when their queue is empty.
// Default both queues to "has work" so existing drain-call assertions keep
// exercising the drain path; empty-queue probe-skip cases override per test.
const mockHasPendingChapterClaimsForUser = jest.fn();
const mockGetPendingChapterClaims = jest.fn();
jest.mock('../db/queries', () => ({
  hasPendingChapterClaimsForUser: (userId: number) =>
    mockHasPendingChapterClaimsForUser(userId),
  getPendingChapterClaims: () => mockGetPendingChapterClaims(),
}));
const mockGetPendingStageAdvances = jest.fn();
jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: () => mockGetPendingStageAdvances(),
}));
beforeEach(() => {
  mockHasPendingChapterClaimsForUser.mockResolvedValue(true);
  mockGetPendingChapterClaims.mockResolvedValue([
    { id: 1, userId: 9 },
    { id: 2, userId: 9 },
    { id: 3, userId: 4 },
  ]);
  mockGetPendingStageAdvances.mockResolvedValue([
    { id: 1, userId: 1 },
    { id: 2, userId: 2 },
    { id: 3, userId: 9 },
  ]);
});

const insertMasterDataMock = jest.mocked(insertMasterData);
const insertProjectsMock = jest.mocked(insertProjects);
const insertUserProjectsMock = jest.mocked(insertUserProjects);
const reconcileUserMilestonesMock = jest.mocked(reconcileUserMilestones);
const reconcileUserProjectsMock = jest.mocked(reconcileUserProjects);
const ensureUserProjectMembershipMock = jest.mocked(
  ensureUserProjectMembership,
);
const insertChapterAssignmentSyncDataMock = jest.mocked(
  insertChapterAssignmentSyncData,
);
const insertBibleTextsMock = jest.mocked(insertBibleTexts);
const recordBibleTextAbsencesMock = jest.mocked(recordBibleTextAbsences);
const clearBibleTextAbsencesMock = jest.mocked(clearBibleTextAbsences);
const getBibleTextAbsencesForBibleMock = jest.mocked(
  getBibleTextAbsencesForBible,
);
const getChaptersToSyncMock = jest.mocked(getChaptersToSync);
const getRecordingLinkedChaptersToSyncMock = jest.mocked(
  getRecordingLinkedChaptersToSync,
);
const setSyncErrorMock = jest.mocked(setSyncError);
const clearSyncErrorMock = jest.mocked(clearSyncError);
const setSyncCountMock = jest.mocked(setSyncCount);
const getConnectivitySnapshotMock = jest.mocked(getConnectivitySnapshot);
const syncPendingChapterClaimsMock = jest.mocked(syncPendingChapterClaims);
const syncPendingStageAdvancesMock = jest.mocked(syncPendingStageAdvances);
const isBibleTextsServerIdRemapPendingMock = jest.mocked(
  isBibleTextsServerIdRemapPending,
);
const clearBibleTextsServerIdRemapPendingMock = jest.mocked(
  clearBibleTextsServerIdRemapPending,
);
const getMasterDataLastSyncedAtMock = jest.mocked(getMasterDataLastSyncedAt);
const setMasterDataLastSyncedAtMock = jest.mocked(setMasterDataLastSyncedAt);
const getMasterDataUpdatedAtMock = jest.mocked(getMasterDataUpdatedAt);
const setMasterDataUpdatedAtMock = jest.mocked(setMasterDataUpdatedAt);

function mockDbCount(count: number) {
  (getDatabase as jest.Mock).mockReturnValue({
    execute: jest.fn().mockResolvedValue({ rows: [{ count }] }),
  });
}

describe('sync step orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbCount(0);
    getConnectivitySnapshotMock.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    syncPendingChapterClaimsMock.mockResolvedValue({
      synced: 0,
      conflicts: 0,
      failed: 0,
    });
    (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
      { id: 1, langName: 'English', langCodeIso6393: 'eng' },
    ]);
    (FluentAPI.getBooks as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Genesis' },
    ]);
    (FluentAPI.getBibles as jest.Mock).mockResolvedValue([
      { id: 10, name: 'Source' },
    ]);
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      data: [],
    });
    getChaptersToSyncMock.mockResolvedValue(new Map());
    getRecordingLinkedChaptersToSyncMock.mockResolvedValue(new Map());
    isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    getMasterDataLastSyncedAtMock.mockReturnValue('');
    getMasterDataUpdatedAtMock.mockReturnValue('');
    // Prefer known-user catalogue scoping; leave active unset so AuthError
    // paths that only call handleSyncAuthFailure when active is set stay clean.
    (getKnownUserIds as jest.Mock).mockReturnValue(['1']);
    (getActiveUserId as jest.Mock).mockReturnValue(undefined);
  });

  describe('syncMasterData', () => {
    const prior = '2026-01-01T00:00:00.000Z';

    function stubCollectionCursors(
      values: Partial<Record<'languages' | 'books' | 'bibles', string>> = {},
    ) {
      getMasterDataUpdatedAtMock.mockImplementation(collection => {
        return values[collection] ?? prior;
      });
    }

    it('inserts languages, books, and bibles then clears the error key', async () => {
      await syncMasterData('session-tok');

      expect(FluentAPI.getLanguages).toHaveBeenCalledWith(
        undefined,
        'session-tok',
      );
      expect(FluentAPI.getBooks).toHaveBeenCalledWith(undefined, 'session-tok');
      expect(FluentAPI.getBibles).toHaveBeenCalledWith(
        undefined,
        'session-tok',
      );
      expect(insertMasterDataMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 1,
            langName: 'English',
            langCode: 'eng',
          }),
        ],
        [{ id: 1, name: 'Genesis' }],
        [{ id: 10, name: 'Source' }],
      );
      expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_master_data');
    });

    it('issues the three collection requests concurrently and still writes in FK order (#886)', async () => {
      // Each request blocks until released; all three must be in flight
      // before any one of them resolves.
      let inFlight = 0;
      let maxInFlight = 0;
      const releases: Array<() => void> = [];
      const gated = <T>(value: T) =>
        jest.fn().mockImplementation(
          () =>
            new Promise<T>(resolve => {
              inFlight += 1;
              maxInFlight = Math.max(maxInFlight, inFlight);
              releases.push(() => {
                inFlight -= 1;
                resolve(value);
              });
            }),
        );
      (FluentAPI.getLanguages as jest.Mock).mockImplementation(
        gated([{ id: 1, langName: 'English', langCode: 'eng' }]),
      );
      (FluentAPI.getBooks as jest.Mock).mockImplementation(
        gated([{ id: 1, name: 'Genesis' }]),
      );
      (FluentAPI.getBibles as jest.Mock).mockImplementation(
        gated([{ id: 10, name: 'Source' }]),
      );

      const pending = syncMasterData('session-tok');
      await Promise.resolve();
      await Promise.resolve();
      expect(releases).toHaveLength(3);
      expect(maxInFlight).toBe(3);
      expect(insertMasterDataMock).not.toHaveBeenCalled();

      // Release out of order: the write must not start until all three
      // arrive, and its argument order (languages, books, bibles) is fixed.
      releases[2]();
      releases[0]();
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve();
      }
      expect(insertMasterDataMock).not.toHaveBeenCalled();
      releases[1]();
      await pending;

      expect(insertMasterDataMock).toHaveBeenCalledTimes(1);
      expect(insertMasterDataMock).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 1, langCode: 'eng' })],
        [{ id: 1, name: 'Genesis' }],
        [{ id: 10, name: 'Source' }],
      );
    });

    it('handles one AuthError once while the sibling requests are still pending (#886)', async () => {
      (getActiveUserId as jest.Mock).mockReturnValue('1');
      let releaseBooks: (() => void) | undefined;
      let releaseBibles: (() => void) | undefined;
      (FluentAPI.getLanguages as jest.Mock).mockRejectedValue(
        new AuthError('User not authenticated'),
      );
      (FluentAPI.getBooks as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve => {
            releaseBooks = () => resolve([{ id: 1, name: 'Genesis' }]);
          }),
      );
      (FluentAPI.getBibles as jest.Mock).mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            releaseBibles = () => reject(new AuthError('late sibling 401'));
          }),
      );

      await expect(syncMasterData('session-tok')).rejects.toBeInstanceOf(
        AuthError,
      );

      // Auth failure handled exactly once, no retry, nothing written.
      expect(setReauthRequired).toHaveBeenCalledTimes(1);
      expect(setSyncErrorMock).toHaveBeenCalledTimes(1);
      expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(1);
      expect(insertMasterDataMock).not.toHaveBeenCalled();
      expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();

      // Late siblings settle (one resolves, one rejects) without a second
      // auth handling pass or an unhandled rejection.
      releaseBooks?.();
      releaseBibles?.();
      for (let tick = 0; tick < 10; tick += 1) {
        await Promise.resolve();
      }
      expect(setReauthRequired).toHaveBeenCalledTimes(1);
      expect(setSyncErrorMock).toHaveBeenCalledTimes(1);
    });

    it('passes each collection cursor as updatedAfter for incremental sync', async () => {
      stubCollectionCursors({
        languages: '2026-06-01T00:00:00.000Z',
        books: '2026-06-02T00:00:00.000Z',
        bibles: '2026-06-03T00:00:00.000Z',
      });
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      await syncMasterData();

      expect(FluentAPI.getLanguages).toHaveBeenCalledWith(
        '2026-06-01T00:00:00.000Z',
        undefined,
      );
      expect(FluentAPI.getBooks).toHaveBeenCalledWith(
        '2026-06-02T00:00:00.000Z',
        undefined,
      );
      expect(FluentAPI.getBibles).toHaveBeenCalledWith(
        '2026-06-03T00:00:00.000Z',
        undefined,
      );
      expect(insertMasterDataMock).toHaveBeenCalledWith([], [], []);
    });

    it('omits updatedAfter when forceFull is set and still stores server updatedAt', async () => {
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
        {
          id: 1,
          langName: 'English',
          langCodeIso6393: 'eng',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([
        { id: 1, name: 'Genesis', updatedAt: '2026-07-02T00:00:00.000Z' },
      ]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([
        { id: 10, name: 'Source', updatedAt: '2026-07-03T00:00:00.000Z' },
      ]);

      await syncMasterData('session-tok', { forceFull: true });

      expect(FluentAPI.getLanguages).toHaveBeenCalledWith(
        undefined,
        'session-tok',
      );
      expect(FluentAPI.getBooks).toHaveBeenCalledWith(undefined, 'session-tok');
      expect(FluentAPI.getBibles).toHaveBeenCalledWith(
        undefined,
        'session-tok',
      );
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'languages',
        '2026-07-01T00:00:00.000Z',
      );
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'books',
        '2026-07-02T00:00:00.000Z',
      );
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'bibles',
        '2026-07-03T00:00:00.000Z',
      );
      expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
    });

    it('stores the original server updatedAt even when the device clock is ahead', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-12-31T23:59:59.000Z'));
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
        {
          id: 1,
          langName: 'English',
          langCodeIso6393: 'eng',
          updatedAt: '2026-03-15T08:01:02.345Z',
        },
      ]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      try {
        await syncMasterData();

        expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
          'languages',
          '2026-03-15T08:01:02.345Z',
        );
        expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalledWith(
          'languages',
          '2026-12-31T23:59:59.000Z',
        );
        expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith('books', prior);
        expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
          'bibles',
          prior,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('logs cursor presence and returned counts without labeling delta vs full', async () => {
      const transport = jest.fn();
      logger.setTransport(transport);
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([
        { id: 1, name: 'Genesis', updatedAt: '2026-02-01T00:00:00.000Z' },
      ]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      try {
        await syncMasterData();

        expect(transport).toHaveBeenCalledWith(
          'info',
          'SyncService',
          'Syncing master data...',
          expect.objectContaining({
            languagesCursor: true,
            booksCursor: true,
            biblesCursor: true,
          }),
        );
        expect(transport).toHaveBeenCalledWith(
          'info',
          'SyncService',
          'Master data fetched',
          expect.objectContaining({
            languagesCount: 0,
            booksCount: 1,
            biblesCount: 0,
            languagesCursor: true,
            booksCursor: true,
            biblesCursor: true,
          }),
        );
        expect(transport).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ incremental: expect.anything() }),
        );
      } finally {
        logger.reset();
      }
    });

    it('keeps each prior cursor when a collection returns an empty delta', async () => {
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      await syncMasterData();

      expect(insertMasterDataMock).toHaveBeenCalledWith([], [], []);
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'languages',
        prior,
      );
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith('books', prior);
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith('bibles', prior);
    });

    it('advances only the collection that returned a newer updatedAt', async () => {
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
        {
          id: 1,
          langName: 'English',
          langCodeIso6393: 'eng',
          updatedAt: '2026-06-15T12:00:00.000Z',
        },
      ]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      await syncMasterData();

      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'languages',
        '2026-06-15T12:00:00.000Z',
      );
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith('books', prior);
      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith('bibles', prior);
    });

    it('keeps the original server string when updatedAt values tie', async () => {
      stubCollectionCursors();
      const tied = '2026-04-01T00:00:00.123Z';
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
        {
          id: 1,
          langName: 'English',
          langCodeIso6393: 'eng',
          updatedAt: tied,
        },
        {
          id: 2,
          langName: 'Spanish',
          langCodeIso6393: 'spa',
          updatedAt: tied,
        },
      ]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      await syncMasterData();

      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'languages',
        tied,
      );
    });

    it('keeps the prior cursor when items omit or send unparseable updatedAt', async () => {
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
        { id: 1, langName: 'English', langCodeIso6393: 'eng' },
        {
          id: 2,
          langName: 'Spanish',
          langCodeIso6393: 'spa',
          updatedAt: null,
        },
        {
          id: 3,
          langName: 'French',
          langCodeIso6393: 'fra',
          updatedAt: 'not-a-date',
        },
      ]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      await syncMasterData();

      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'languages',
        prior,
      );
    });

    it('keeps the prior cursor when any item in a batch is missing updatedAt', async () => {
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
        {
          id: 1,
          langName: 'English',
          langCodeIso6393: 'eng',
          updatedAt: '2026-10-23T12:00:00.000Z',
        },
        { id: 2, langName: 'Spanish', langCodeIso6393: 'spa' },
      ]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      await syncMasterData();

      expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
        'languages',
        prior,
      );
    });

    it('does not advance any cursor when the third endpoint fails', async () => {
      jest.useFakeTimers();
      stubCollectionCursors();
      (FluentAPI.getBibles as jest.Mock).mockRejectedValue(
        new ApiError(500, 'bibles unavailable'),
      );

      try {
        const pending = syncMasterData();
        const expectation =
          expect(pending).rejects.toThrow('bibles unavailable');

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(FluentAPI.getLanguages).toHaveBeenCalled();
        expect(FluentAPI.getBooks).toHaveBeenCalled();
        expect(insertMasterDataMock).not.toHaveBeenCalled();
        expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();
        expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not advance cursors when insertMasterData fails after all fetches', async () => {
      jest.useFakeTimers();
      stubCollectionCursors();
      insertMasterDataMock.mockRejectedValue(new Error('insert failed'));

      try {
        const pending = syncMasterData();
        const expectation = expect(pending).rejects.toThrow('insert failed');

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(insertMasterDataMock).toHaveBeenCalled();
        expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();
      } finally {
        insertMasterDataMock.mockResolvedValue(undefined);
        jest.useRealTimers();
      }
    });

    it('advances cursors after a successful retry', async () => {
      jest.useFakeTimers();
      stubCollectionCursors();
      (FluentAPI.getLanguages as jest.Mock)
        .mockRejectedValueOnce(new ApiError(500, 'catalog unavailable'))
        .mockResolvedValue([
          {
            id: 1,
            langName: 'English',
            langCodeIso6393: 'eng',
            updatedAt: '2026-06-15T12:00:00.000Z',
          },
        ]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      try {
        const pending = syncMasterData();
        await jest.advanceTimersByTimeAsync(500);
        await pending;

        expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(2);
        expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
          'languages',
          '2026-06-15T12:00:00.000Z',
        );
        expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith('books', prior);
        expect(setMasterDataUpdatedAtMock).toHaveBeenCalledWith(
          'bibles',
          prior,
        );
        expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('retries non-auth failures then sets the sync error', async () => {
      jest.useFakeTimers();
      (FluentAPI.getLanguages as jest.Mock).mockRejectedValue(
        new ApiError(500, 'catalog unavailable'),
      );

      try {
        const pending = syncMasterData();
        const expectation = expect(pending).rejects.toThrow(
          'catalog unavailable',
        );

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(3);
        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_master_data',
          'catalog unavailable',
        );
        expect(insertMasterDataMock).not.toHaveBeenCalled();
        expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();
        expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('does not retry AuthError and stores the sync error once', async () => {
      (FluentAPI.getLanguages as jest.Mock).mockRejectedValue(
        new AuthError('User not authenticated'),
      );

      await expect(syncMasterData('session-tok')).rejects.toBeInstanceOf(
        AuthError,
      );

      expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(1);
      expect(FluentAPI.getLanguages).toHaveBeenCalledWith(
        undefined,
        'session-tok',
      );
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_master_data',
        'User not authenticated',
      );
      expect(insertMasterDataMock).not.toHaveBeenCalled();
      expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();
    });

    it('does not persist DNS/timeout transport failures as sync errors', async () => {
      jest.useFakeTimers();
      (FluentAPI.getLanguages as jest.Mock).mockRejectedValue(
        new ApiError(0, 'Unable to resolve host api.fluent.bible'),
      );

      try {
        const pending = syncMasterData();
        const expectation = expect(pending).rejects.toThrow(
          'Unable to resolve host api.fluent.bible',
        );

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(3);
        expect(setSyncErrorMock).not.toHaveBeenCalled();
        expect(insertMasterDataMock).not.toHaveBeenCalled();
        expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('syncProjects', () => {
    it('maps API projects, inserts membership, and sets the count', async () => {
      mockDbCount(1);
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 2,
          },
        ],
      });

      await syncProjects(2);

      expect(insertProjectsMock).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 7,
          name: 'Alpha',
          sourceLanguageId: 1,
          targetLanguageId: 2,
        }),
      ]);
      expect(insertUserProjectsMock).toHaveBeenCalledWith(2, [7]);
      expect(reconcileUserMilestonesMock).not.toHaveBeenCalled();
      expect(reconcileUserProjectsMock).toHaveBeenCalledWith(2, [7]);
      expect(ensureUserProjectMembershipMock).toHaveBeenCalledWith(2);
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_projects', 1);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_projects');
    });

    it('uses the membership count the guard just read', async () => {
      const execute = jest.fn().mockResolvedValue({ rows: [{ count: 9 }] });
      (getDatabase as jest.Mock).mockReturnValue({ execute });
      ensureUserProjectMembershipMock.mockResolvedValueOnce(3);
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [{ id: 7, name: 'Alpha', sourceLanguageId: 1 }],
      });

      await syncProjects(2);

      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_projects', 3);
      expect(
        execute.mock.calls.filter(([sql]) =>
          String(sql).includes('FROM user_projects WHERE user_id = ?'),
        ),
      ).toHaveLength(0);
    });

    it('counts again after the guard backfills membership', async () => {
      mockDbCount(4);
      ensureUserProjectMembershipMock.mockResolvedValueOnce(null);
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [{ id: 7, name: 'Alpha', sourceLanguageId: 1 }],
      });

      await syncProjects(2);

      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_projects', 4);
    });

    it('counts membership when the confirmed project list is empty', async () => {
      mockDbCount(0);
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });

      await syncProjects(2);

      expect(ensureUserProjectMembershipMock).not.toHaveBeenCalled();
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_projects', 0);
    });

    it('clears local milestones before membership when the project list is empty', async () => {
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });

      await syncProjects(2);

      expect(reconcileUserMilestonesMock).toHaveBeenCalledWith(2, []);
      expect(reconcileUserProjectsMock).toHaveBeenCalledWith(2, []);
      expect(
        reconcileUserMilestonesMock.mock.invocationCallOrder[0],
      ).toBeLessThan(reconcileUserProjectsMock.mock.invocationCallOrder[0]);
      expect(ensureUserProjectMembershipMock).not.toHaveBeenCalled();
    });

    it('seedFkParents fetches unique languages by id without advancing master cursor (#679)', async () => {
      mockDbCount(1);
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 1,
          },
        ],
      });
      (FluentAPI.getLanguage as jest.Mock).mockResolvedValue({
        id: 1,
        langName: 'English',
        langCodeIso6393: 'eng',
      });

      await syncProjects(2, 'seed-tok', { seedFkParents: true });

      expect(FluentAPI.getLanguage).toHaveBeenCalledTimes(1);
      expect(FluentAPI.getLanguage).toHaveBeenCalledWith(1, 'seed-tok');
      expect(insertMasterDataMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 1,
            langName: 'English',
            langCode: 'eng',
          }),
        ],
        [],
        [],
      );
      expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
      expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();
      expect(insertProjectsMock).toHaveBeenCalled();
      const seedOrder = insertMasterDataMock.mock.invocationCallOrder[0];
      const projectOrder = insertProjectsMock.mock.invocationCallOrder[0];
      expect(seedOrder).toBeLessThan(projectOrder);
    });

    it('seedFkParents failure does not insert projects (#679)', async () => {
      jest.useFakeTimers();
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 2,
          },
        ],
      });
      (FluentAPI.getLanguage as jest.Mock).mockRejectedValue(
        new Error('language missing'),
      );

      try {
        const pending = syncProjects(2, 'seed-tok', { seedFkParents: true });
        const expectation = expect(pending).rejects.toThrow('language missing');

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(insertProjectsMock).not.toHaveBeenCalled();
        expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
        expect(setMasterDataUpdatedAtMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('seedFkParentsBestEffort upserts successes and reports incomplete on 404', async () => {
      mockDbCount(1);
      const selectExistingIdsMock = jest.requireMock('../db/repository')
        .selectExistingIds as jest.Mock;
      selectExistingIdsMock.mockResolvedValue(new Set([1, 2]));
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 2,
          },
        ],
      });
      (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) => {
        if (id === 2) {
          return Promise.reject(new ApiError(404, 'Language not found'));
        }
        return Promise.resolve({
          id,
          langName: 'English',
          langCodeIso6393: 'eng',
        });
      });

      const result = await syncProjects(2, 'seed-tok', {
        seedFkParents: true,
        seedFkParentsBestEffort: true,
      });

      expect(result.parentSeedIncomplete).toEqual(
        expect.stringContaining('Incomplete language parent refresh'),
      );
      expect(insertMasterDataMock).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 1, langCode: 'eng' })],
        [],
        [],
      );
      expect(insertProjectsMock).toHaveBeenCalled();
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_projects',
        expect.stringContaining('Incomplete language parent refresh'),
      );
      expect(setMasterDataLastSyncedAtMock).not.toHaveBeenCalled();
    });

    it('seedFkParentsBestEffort AuthError still aborts without project insert', async () => {
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 2,
          },
        ],
      });
      (FluentAPI.getLanguage as jest.Mock).mockRejectedValue(
        new AuthError('Invalid or revoked session token'),
      );

      await expect(
        syncProjects(2, 'seed-tok', {
          seedFkParents: true,
          seedFkParentsBestEffort: true,
        }),
      ).rejects.toBeInstanceOf(AuthError);

      expect(insertProjectsMock).not.toHaveBeenCalled();
      expect(insertMasterDataMock).not.toHaveBeenCalled();
    });

    it('seedFkParentsBestEffort warm warn logs classification/status only — never raw error text', async () => {
      mockDbCount(1);
      const selectExistingIdsMock = jest.requireMock('../db/repository')
        .selectExistingIds as jest.Mock;
      selectExistingIdsMock.mockResolvedValue(new Set([1, 2]));
      const warnPayloads: Array<Record<string, unknown>> = [];
      logger.setTransport((level, _tag, message, context) => {
        if (
          level === 'warn' &&
          typeof message === 'string' &&
          message.includes('FK parent by-id lookup failed') &&
          context
        ) {
          warnPayloads.push(context);
        }
      });

      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 2,
          },
        ],
      });
      (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) => {
        if (id === 2) {
          return Promise.reject(
            new ApiError(502, 'super-secret-token-xyz body leak'),
          );
        }
        return Promise.resolve({
          id,
          langName: 'English',
          langCodeIso6393: 'eng',
        });
      });

      try {
        const result = await syncProjects(2, 'seed-tok', {
          seedFkParents: true,
          seedFkParentsBestEffort: true,
        });

        expect(result.parentSeedIncomplete).toEqual(
          expect.stringContaining('Incomplete language parent refresh'),
        );
        expect(warnPayloads).toHaveLength(1);
        expect(warnPayloads[0]).toMatchObject({
          kind: 'language',
          id: 2,
          classification: 'api',
          apiStatus: 502,
        });
        expect(JSON.stringify(warnPayloads[0])).not.toContain(
          'super-secret-token-xyz',
        );
        expect(warnPayloads[0]).not.toHaveProperty('error');
        expect(warnPayloads[0]).not.toHaveProperty('message');
        expect(warnPayloads[0]).not.toHaveProperty('body');
        expect(warnPayloads[0]).not.toHaveProperty('stack');
        expect(insertProjectsMock).toHaveBeenCalled();
      } finally {
        logger.reset();
      }
    });

    it('seedFkParentsBestEffort warm warn retains Error classification without apiStatus', async () => {
      mockDbCount(1);
      const selectExistingIdsMock = jest.requireMock('../db/repository')
        .selectExistingIds as jest.Mock;
      selectExistingIdsMock.mockResolvedValue(new Set([1, 2]));
      const warnPayloads: Array<Record<string, unknown>> = [];
      logger.setTransport((level, _tag, message, context) => {
        if (
          level === 'warn' &&
          typeof message === 'string' &&
          message.includes('FK parent by-id lookup failed') &&
          context
        ) {
          warnPayloads.push(context);
        }
      });

      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 2,
          },
        ],
      });
      (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) => {
        if (id === 2) {
          return Promise.reject(
            new Error('raw-arbitrary-detail-should-not-log'),
          );
        }
        return Promise.resolve({
          id,
          langName: 'English',
          langCodeIso6393: 'eng',
        });
      });

      try {
        await syncProjects(2, 'seed-tok', {
          seedFkParents: true,
          seedFkParentsBestEffort: true,
        });

        expect(warnPayloads).toHaveLength(1);
        expect(warnPayloads[0]).toMatchObject({
          kind: 'language',
          id: 2,
          classification: 'error',
        });
        expect(warnPayloads[0]).not.toHaveProperty('apiStatus');
        expect(JSON.stringify(warnPayloads[0])).not.toContain(
          'raw-arbitrary-detail-should-not-log',
        );
      } finally {
        logger.reset();
      }
    });

    it('does not by-id seed when seedFkParents is omitted', async () => {
      mockDbCount(1);
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
        data: [
          {
            id: 7,
            name: 'Alpha',
            sourceLanguageId: 1,
            targetLanguageId: 2,
          },
        ],
      });

      await syncProjects(2, 'no-seed-tok');

      expect(FluentAPI.getLanguage).not.toHaveBeenCalled();
      expect(insertMasterDataMock).not.toHaveBeenCalled();
    });
  });

  describe('syncChapterAssignments', () => {
    it('inserts assignments and user projects for fetched rows', async () => {
      mockDbCount(3);
      const pullRevision = getChapterAssignmentPullRevision();
      (FluentAPI.getChapterAssignments as jest.Mock).mockImplementation(
        async () => {
          markChapterCompleteConfirmed(11);
          return {
            data: [
              {
                chapterAssignmentId: 11,
                projectUnitId: 22,
                projectId: 5,
                bibleId: 10,
                bookId: 1,
                chapterNumber: 1,
                chapterStatus: 'in_progress',
                totalVerses: 10,
                completedVerses: 2,
              },
            ],
          };
        },
      );

      await syncChapterAssignments(2, '2026-06-01T00:00:00.000Z');

      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
        2,
        '2026-06-01T00:00:00.000Z',
        undefined,
        undefined,
      );
      expect(insertChapterAssignmentSyncDataMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            chapterAssignmentId: 11,
            projectId: 5,
            chapterStatus: 'in_progress',
          }),
        ],
        pullRevision,
      );
      expect(insertUserProjectsMock).toHaveBeenCalledWith(2, [5]);
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_chapters', 3);
      expect(clearSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_chapter_assignments',
      );
    });

    it('sets chapter assignment sync error when all rows are FK-skipped', async () => {
      jest.useFakeTimers();
      insertChapterAssignmentSyncDataMock.mockResolvedValue({
        insertedCount: 0,
        skipped: [
          { chapterAssignmentId: 11, reason: 'missing_bible' as const },
        ],
      });
      (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
        data: [
          {
            chapterAssignmentId: 11,
            projectUnitId: 22,
            projectId: 5,
            bibleId: 10,
            bookId: 1,
            chapterNumber: 1,
            chapterStatus: 'in_progress',
            totalVerses: 10,
            completedVerses: 2,
          },
        ],
      });

      try {
        const pending = syncChapterAssignments(2);
        const expectation = expect(pending).rejects.toThrow(
          'Skipped all 1 chapter assignment(s) — missing FK parents',
        );

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_chapter_assignments',
          'Skipped all 1 chapter assignment(s) — missing FK parents',
        );
      } finally {
        jest.useRealTimers();
        insertChapterAssignmentSyncDataMock.mockResolvedValue({
          insertedCount: 1,
          skipped: [],
        });
      }
    });

    it('seedFkParentsBestEffort soft-skips all-invalid catalogue and membership', async () => {
      mockDbCount(0);
      const selectExistingIdsMock = jest.requireMock('../db/repository')
        .selectExistingIds as jest.Mock;
      selectExistingIdsMock.mockResolvedValue(new Set());
      insertChapterAssignmentSyncDataMock.mockResolvedValue({
        insertedCount: 0,
        skipped: [
          { chapterAssignmentId: 11, reason: 'missing_project_unit' as const },
        ],
      });
      (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
        syncedAt: '2026-08-18T07:10:52.908Z',
        data: [
          {
            chapterAssignmentId: 11,
            projectUnitId: 22,
            projectId: 404,
            bibleId: 10,
            bookId: 1,
            chapterNumber: 1,
            chapterStatus: 'in_progress',
            totalVerses: 10,
            completedVerses: 2,
          },
        ],
      });

      try {
        const result = await syncChapterAssignments(
          2,
          undefined,
          undefined,
          'tok',
          { seedFkParentsBestEffort: true },
        );

        expect(result.partialSkipWarning).toBe(
          'Skipped all 1 chapter assignment(s) — missing FK parents',
        );
        expect(result.syncedAt).toBe('2026-08-18T07:10:52.908Z');
        expect(insertUserProjectsMock).not.toHaveBeenCalled();
      } finally {
        insertChapterAssignmentSyncDataMock.mockResolvedValue({
          insertedCount: 1,
          skipped: [],
        });
      }
    });

    it('seedFkParentsBestEffort mixed catalogue membership uses existing projects only', async () => {
      mockDbCount(1);
      const selectExistingIdsMock = jest.requireMock('../db/repository')
        .selectExistingIds as jest.Mock;
      selectExistingIdsMock.mockResolvedValue(new Set([5]));
      insertChapterAssignmentSyncDataMock.mockResolvedValue({
        insertedCount: 1,
        skipped: [
          {
            chapterAssignmentId: 12,
            reason: 'missing_project_unit' as const,
          },
        ],
      });
      (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
        syncedAt: '2026-08-18T07:10:52.908Z',
        data: [
          {
            chapterAssignmentId: 11,
            projectUnitId: 22,
            projectId: 5,
            bibleId: 10,
            bookId: 1,
            chapterNumber: 1,
            chapterStatus: 'in_progress',
            totalVerses: 10,
            completedVerses: 2,
          },
          {
            chapterAssignmentId: 12,
            projectUnitId: 23,
            projectId: 404,
            bibleId: 10,
            bookId: 1,
            chapterNumber: 2,
            chapterStatus: 'in_progress',
            totalVerses: 10,
            completedVerses: 0,
          },
        ],
      });

      try {
        const result = await syncChapterAssignments(
          2,
          undefined,
          undefined,
          'tok',
          { seedFkParentsBestEffort: true },
        );

        expect(result.partialSkipWarning).toBe(
          'Skipped 1 of 2 chapter assignment(s) — missing FK parents',
        );
        expect(insertUserProjectsMock).toHaveBeenCalledWith(2, [5]);
        expect(insertUserProjectsMock).not.toHaveBeenCalledWith(
          2,
          expect.arrayContaining([404]),
        );
      } finally {
        insertChapterAssignmentSyncDataMock.mockResolvedValue({
          insertedCount: 1,
          skipped: [],
        });
      }
    });

    it('returns a partial-skip warning when some rows insert and others are skipped', async () => {
      mockDbCount(3);
      insertChapterAssignmentSyncDataMock.mockResolvedValue({
        insertedCount: 1,
        skipped: [{ chapterAssignmentId: 12, reason: 'missing_book' as const }],
      });
      (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
        data: [
          {
            chapterAssignmentId: 11,
            projectUnitId: 22,
            projectId: 5,
            bibleId: 10,
            bookId: 1,
            chapterNumber: 1,
            chapterStatus: 'in_progress',
            totalVerses: 10,
            completedVerses: 2,
          },
          {
            chapterAssignmentId: 12,
            projectUnitId: 22,
            projectId: 5,
            bibleId: 10,
            bookId: 1,
            chapterNumber: 2,
            chapterStatus: 'in_progress',
            totalVerses: 10,
            completedVerses: 0,
          },
        ],
      });

      await expect(syncChapterAssignments(2)).resolves.toEqual({
        syncedAt: undefined,
        partialSkipWarning:
          'Skipped 1 of 2 chapter assignment(s) — missing FK parents',
      });
    });
  });

  describe('syncPendingChapterClaimsForUser', () => {
    it('syncs pending offline claims when online and clears the error key', async () => {
      syncPendingChapterClaimsMock.mockResolvedValue({
        synced: 2,
        conflicts: 0,
        failed: 0,
      });

      await expect(syncPendingChapterClaimsForUser(9)).resolves.toEqual({
        synced: 2,
        conflicts: 0,
        failed: 0,
      });

      expect(syncPendingChapterClaimsMock).toHaveBeenCalledWith(9, undefined);
      expect(clearSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_chapter_claims',
      );
    });

    it('reports offline pending claims as deferred instead of a clean empty drain (#886)', async () => {
      getConnectivitySnapshotMock.mockResolvedValue({
        isOnline: false,
        isWifi: false,
        isCellular: false,
        connectionType: 'none',
      });

      await expect(syncPendingChapterClaimsForUser(9)).resolves.toEqual({
        synced: 0,
        conflicts: 0,
        failed: 0,
        deferred: 2,
      });

      expect(syncPendingChapterClaimsMock).not.toHaveBeenCalled();
    });

    it('assumes one deferred claim when the offline count cannot be read (#886)', async () => {
      getConnectivitySnapshotMock.mockResolvedValue({
        isOnline: false,
        isWifi: false,
        isCellular: false,
        connectionType: 'none',
      });
      mockGetPendingChapterClaims.mockRejectedValueOnce(new Error('db closed'));

      await expect(syncPendingChapterClaimsForUser(9)).resolves.toMatchObject({
        deferred: 1,
      });
    });

    it('does not persist transport failures when pending claim sync fails', async () => {
      jest.useFakeTimers();
      syncPendingChapterClaimsMock.mockRejectedValue(new Error('network'));

      try {
        const pending = syncPendingChapterClaimsForUser(9);
        const expectation = expect(pending).resolves.toEqual({
          synced: 0,
          conflicts: 0,
          failed: 1,
        });

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(syncPendingChapterClaimsMock).toHaveBeenCalledTimes(3);
        expect(setSyncErrorMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('retries non-auth server failures then persists a sync error', async () => {
      jest.useFakeTimers();
      syncPendingChapterClaimsMock.mockRejectedValue(
        new ApiError(500, 'catalog unavailable'),
      );

      try {
        const pending = syncPendingChapterClaimsForUser(9);
        const expectation = expect(pending).resolves.toEqual({
          synced: 0,
          conflicts: 0,
          failed: 1,
        });

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(syncPendingChapterClaimsMock).toHaveBeenCalledTimes(3);
        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_chapter_claims',
          'catalog unavailable',
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('retries pending claim failures then soft-fails without aborting', async () => {
      jest.useFakeTimers();
      syncPendingChapterClaimsMock.mockResolvedValue({
        synced: 0,
        conflicts: 0,
        failed: 1,
      });

      try {
        const pending = syncPendingChapterClaimsForUser(9);
        const expectation = expect(pending).resolves.toEqual({
          synced: 0,
          conflicts: 0,
          failed: 1,
        });

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(syncPendingChapterClaimsMock).toHaveBeenCalledTimes(3);
        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_chapter_claims',
          'Failed to sync 1 pending chapter claim(s)',
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('syncBibleTexts', () => {
    beforeEach(() => {
      // Bare ensure (DraftingScreen) scopes to active user only.
      (getActiveUserId as jest.Mock).mockReturnValue('1');
      (getKnownUserIds as jest.Mock).mockReturnValue(['1', '2']);
    });

    it('short-circuits when there are no chapters to sync', async () => {
      await syncBibleTexts();

      expect(getChaptersToSyncMock).toHaveBeenCalledWith([1]);
      expect(FluentAPI.getBibleTexts).not.toHaveBeenCalled();
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_bibles', 0);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_bible_texts');
    });

    it('passes explicit eligibleUserIds to getChaptersToSync', async () => {
      await syncBibleTexts(undefined, { eligibleUserIds: [2, 3] });

      expect(getChaptersToSyncMock).toHaveBeenCalledWith([2, 3]);
      expect(FluentAPI.getBibleTexts).not.toHaveBeenCalled();
    });

    it('scopes bare syncBibleTexts to the active user only when many accounts are known', async () => {
      (getKnownUserIds as jest.Mock).mockReturnValue(['4', '5']);
      (getActiveUserId as jest.Mock).mockReturnValue('5');

      await syncBibleTexts();

      expect(getChaptersToSyncMock).toHaveBeenCalledWith([5]);
      expect(getChaptersToSyncMock).not.toHaveBeenCalledWith([4, 5]);
    });

    it('uses known-user union for getChaptersToSync when remap is pending', async () => {
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      (getKnownUserIds as jest.Mock).mockReturnValue(['4', '5']);
      (getActiveUserId as jest.Mock).mockReturnValue('5');

      await syncBibleTexts();

      expect(getChaptersToSyncMock).toHaveBeenCalledWith([4, 5]);
      expect(getChaptersToSyncMock).not.toHaveBeenCalledWith([5]);

      getChaptersToSyncMock.mockClear();
      await syncBibleTexts(undefined, { eligibleUserIds: [5] });

      expect(getChaptersToSyncMock).toHaveBeenCalledWith([4, 5]);
      expect(getChaptersToSyncMock).not.toHaveBeenCalledWith([5]);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    });

    it('returns empty catalogue selection when there is no active user', async () => {
      // Production shape: storage returns '' when unset (not undefined).
      (getActiveUserId as jest.Mock).mockReturnValue('');

      await syncBibleTexts();

      expect(getChaptersToSyncMock).toHaveBeenCalledWith([]);
      expect(getChaptersToSyncMock).not.toHaveBeenCalledWith([0]);
    });

    it('uses explicit chapterGroups instead of getChaptersToSync (#670)', async () => {
      mockDbCount(1);
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 41,
            chapterNumber: 1,
            verses: [{ id: 9101, verseNumber: 1, text: 'The beginning' }],
          },
        ],
      });

      await syncBibleTexts(undefined, {
        chapterGroups: new Map([[10, [{ bookId: 41, chapterNumber: 1 }]]]),
      });

      expect(getChaptersToSyncMock).not.toHaveBeenCalled();
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 41, chapterNumber: 1 }],
        undefined,
      );
    });

    it('fetches and inserts verse texts for chapters to sync', async () => {
      mockDbCount(2);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 9001, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      await syncBibleTexts();

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        undefined,
      );
      expect(insertBibleTextsMock).toHaveBeenCalledWith([
        expect.objectContaining({
          bibleId: 10,
          bookId: 1,
          chapterNumber: 1,
          verses: [
            expect.objectContaining({
              id: 9001,
              verse_number: 1,
              text: 'In the beginning',
            }),
          ],
        }),
      ]);
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_bibles', 2);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_bible_texts');
    });

    it('full-fetches without cursor when server-id remap is pending', async () => {
      mockDbCount(2);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 9001, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      await syncBibleTexts('2026-01-01T00:00:00.000Z');

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        undefined,
      );
      expect(clearBibleTextsServerIdRemapPendingMock).toHaveBeenCalled();
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    });

    it('keeps the remap flag when no chapters are available', async () => {
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);

      await syncBibleTexts('2026-01-01T00:00:00.000Z');

      expect(FluentAPI.getBibleTexts).not.toHaveBeenCalled();
      expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    });

    it('keeps remap pending after a scoped Tier 1 chapterGroups pass (#670)', async () => {
      mockDbCount(1);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 41,
            chapterNumber: 1,
            verses: [{ id: 4101, verseNumber: 1, text: 'The beginning' }],
          },
        ],
      });

      await syncBibleTexts('2026-01-01T00:00:00.000Z', {
        chapterGroups: new Map([[10, [{ bookId: 41, chapterNumber: 1 }]]]),
      });

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 41, chapterNumber: 1 }],
        undefined,
      );
      expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    });

    it('skips excluded My Work chapters but still clears remap when unscoped (#670 Tier 2)', async () => {
      mockDbCount(2);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [
            10,
            [
              { bookId: 41, chapterNumber: 1 },
              { bookId: 19, chapterNumber: 1 },
            ],
          ],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 19,
            chapterNumber: 1,
            verses: [{ id: 1901, verseNumber: 1, text: 'Blessed' }],
          },
        ],
      });

      await syncBibleTexts('2026-01-01T00:00:00.000Z', {
        excludeChapterGroups: new Map([
          [10, [{ bookId: 41, chapterNumber: 1 }]],
        ]),
      });

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(1);
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 19, chapterNumber: 1 }],
        undefined,
      );
      expect(clearBibleTextsServerIdRemapPendingMock).toHaveBeenCalled();
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    });

    it('My-Work-only exclude remainder preserves bible count and clears remap (#670)', async () => {
      // Tier 1 already wrote texts; getChaptersToSync is only My Work; recording-linked empty.
      mockDbCount(3);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 41, chapterNumber: 1 }]]]),
      );
      getRecordingLinkedChaptersToSyncMock.mockResolvedValue(new Map());

      await syncBibleTexts(undefined, {
        excludeChapterGroups: new Map([
          [10, [{ bookId: 41, chapterNumber: 1 }]],
        ]),
      });

      expect(FluentAPI.getBibleTexts).not.toHaveBeenCalled();
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_bibles', 3);
      expect(setSyncCountMock).not.toHaveBeenCalledWith('sync_count_bibles', 0);
      expect(clearBibleTextsServerIdRemapPendingMock).toHaveBeenCalled();
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    });

    it('remaps recording-linked chapters absent from chapter_assignments', async () => {
      mockDbCount(1);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      // Assignment list empty — verse only reachable via a local recording.
      getChaptersToSyncMock.mockResolvedValue(new Map());
      getRecordingLinkedChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 40, chapterNumber: 5 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 40,
            chapterNumber: 5,
            verses: [{ id: 5001, verseNumber: 1, text: 'Blessed are' }],
          },
        ],
      });

      await syncBibleTexts('2026-01-01T00:00:00.000Z');

      expect(getRecordingLinkedChaptersToSyncMock).toHaveBeenCalled();
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 40, chapterNumber: 5 }],
        undefined,
      );
      expect(insertBibleTextsMock).toHaveBeenCalledWith([
        expect.objectContaining({
          bibleId: 10,
          bookId: 40,
          chapterNumber: 5,
          verses: [expect.objectContaining({ id: 5001, verse_number: 1 })],
        }),
      ]);
      expect(clearBibleTextsServerIdRemapPendingMock).toHaveBeenCalled();
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
    });

    it('rejects verses missing a server id', async () => {
      jest.useFakeTimers();
      mockDbCount(0);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      try {
        const pending = syncBibleTexts();
        const expectation =
          expect(pending).rejects.toThrow(/missing verse id/i);

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(insertBibleTextsMock).not.toHaveBeenCalled();
        expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_bible_texts',
          expect.stringMatching(/missing verse id/i),
        );
      } finally {
        isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
        jest.useRealTimers();
      }
    });

    it('records an all-empty full-fetch 404 as absent without failing the step', async () => {
      mockDbCount(0);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockRejectedValue(
        new ApiError(404, 'Bible texts not found'),
      );

      await expect(syncBibleTexts()).resolves.toEqual({
        coverageIncomplete: true,
      });

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(1);
      expect(insertBibleTextsMock).not.toHaveBeenCalled();
      expect(recordBibleTextAbsencesMock).toHaveBeenCalledWith([
        { bibleId: 10, bookId: 1, chapterNumber: 1 },
      ]);
      expect(setSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.anything(),
      );
    });

    it('records a chapter absent from a full-fetch response rather than failing', async () => {
      mockDbCount(0);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

      await expect(syncBibleTexts('2026-01-01T00:00:00.000Z')).resolves.toEqual(
        { coverageIncomplete: true },
      );

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        undefined,
      );
      expect(recordBibleTextAbsencesMock).toHaveBeenCalledWith([
        { bibleId: 10, bookId: 1, chapterNumber: 1 },
      ]);
      expect(setSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.anything(),
      );
    });

    it('still fails when a chapter whose verses are already here comes back empty', async () => {
      // #177 regression guard: local verses disappearing is a real failure.
      mockDbCount(1);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

      await expect(syncBibleTexts()).rejects.toThrow(
        /Missing bible text chapter\(s\):/i,
      );

      expect(recordBibleTextAbsencesMock).not.toHaveBeenCalled();
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.stringMatching(
          /Missing bible text chapter\(s\):.*absent from full-fetch response/i,
        ),
      );
    });

    it('clears a recorded absence once the chapter returns verses', async () => {
      mockDbCount(0);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      getBibleTextAbsencesForBibleMock.mockResolvedValue([
        { bookId: 1, chapterNumber: 1 },
      ]);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 11, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      await expect(syncBibleTexts()).resolves.toEqual({
        coverageIncomplete: true,
      });

      expect(clearBibleTextAbsencesMock).toHaveBeenCalledWith([
        { bibleId: 10, bookId: 1, chapterNumber: 1 },
      ]);
      expect(recordBibleTextAbsencesMock).not.toHaveBeenCalled();
    });

    it('isolates #177 full-fetch 404 across bible groups (remap off + updatedAfter)', async () => {
      mockDbCount(0);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [10, [{ bookId: 1, chapterNumber: 1 }]],
          [20, [{ bookId: 2, chapterNumber: 1 }]],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
        async (bibleId: number) => {
          if (bibleId === 10) {
            throw new ApiError(404, 'Bible texts not found');
          }
          return {
            data: [
              {
                bookId: 2,
                chapterNumber: 1,
                verses: [{ id: 2001, verseNumber: 1, text: 'Later bible' }],
              },
            ],
          };
        },
      );

      await expect(syncBibleTexts('2026-01-01T00:00:00.000Z')).resolves.toEqual(
        { coverageIncomplete: true },
      );

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        undefined,
      );
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        20,
        [{ bookId: 2, chapterNumber: 1 }],
        undefined,
      );
      expect(insertBibleTextsMock).toHaveBeenCalledWith([
        expect.objectContaining({
          bibleId: 20,
          bookId: 2,
          chapterNumber: 1,
          verses: [expect.objectContaining({ id: 2001 })],
        }),
      ]);
      expect(recordBibleTextAbsencesMock).toHaveBeenCalledWith([
        { bibleId: 10, bookId: 1, chapterNumber: 1 },
      ]);
      expect(setSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_prepare_offline_bible_texts',
        expect.anything(),
      );
    });

    it('stops before later bible groups when a non-404 fetch error is thrown', async () => {
      jest.useFakeTimers();
      mockDbCount(1);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [10, [{ bookId: 1, chapterNumber: 1 }]],
          [20, [{ bookId: 2, chapterNumber: 1 }]],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
        async (bibleId: number) => {
          if (bibleId === 10) {
            throw new ApiError(500, 'upstream failed');
          }
          return {
            data: [
              {
                bookId: 2,
                chapterNumber: 1,
                verses: [{ id: 2001, verseNumber: 1, text: 'Later bible' }],
              },
            ],
          };
        },
      );

      try {
        const pending = syncBibleTexts();
        const expectation = expect(pending).rejects.toThrow(/upstream failed/i);
        await jest.runAllTimersAsync();
        await expectation;
        const bibleIds = (FluentAPI.getBibleTexts as jest.Mock).mock.calls.map(
          (call: unknown[]) => call[0],
        );
        expect(bibleIds.length).toBeGreaterThanOrEqual(1);
        expect(bibleIds.every(id => id === 10)).toBe(true);
        expect(insertBibleTextsMock).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('inserts returned chapters on partial full-fetch and still fails for missing', async () => {
      mockDbCount(1);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [
            10,
            [
              { bookId: 1, chapterNumber: 1 },
              { bookId: 1, chapterNumber: 2 },
            ],
          ],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 9001, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      await expect(syncBibleTexts()).rejects.toThrow(
        /Missing bible text chapter\(s\):/i,
      );

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(1);
      expect(insertBibleTextsMock).toHaveBeenCalledTimes(1);
      expect(insertBibleTextsMock).toHaveBeenCalledWith([
        expect.objectContaining({
          bibleId: 10,
          bookId: 1,
          chapterNumber: 1,
          verses: [expect.objectContaining({ id: 9001 })],
        }),
      ]);
      expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.stringMatching(
          /Missing bible text chapter\(s\):.*absent from full-fetch response/i,
        ),
      );
    });

    it('continues to a later bible group after an earlier full-fetch 404', async () => {
      mockDbCount(1);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [10, [{ bookId: 1, chapterNumber: 1 }]],
          [20, [{ bookId: 2, chapterNumber: 1 }]],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
        async (bibleId: number) => {
          if (bibleId === 10) {
            throw new ApiError(404, 'Bible texts not found');
          }
          return {
            data: [
              {
                bookId: 2,
                chapterNumber: 1,
                verses: [{ id: 2001, verseNumber: 1, text: 'Later bible' }],
              },
            ],
          };
        },
      );

      await expect(syncBibleTexts()).rejects.toThrow(
        /Missing bible text chapter\(s\):/i,
      );

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        20,
        [{ bookId: 2, chapterNumber: 1 }],
        undefined,
      );
      expect(insertBibleTextsMock).toHaveBeenCalledWith([
        expect.objectContaining({
          bibleId: 20,
          bookId: 2,
          chapterNumber: 1,
          verses: [expect.objectContaining({ id: 2001 })],
        }),
      ]);
      expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.stringMatching(/Missing bible text chapter\(s\):.*404/i),
      );
    });

    it('does not clear remap or sync error when missing chapters fail the step', async () => {
      // Local verses present, so the empty response is a regression, not an
      // absence — the step must still fail.
      mockDbCount(1);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

      try {
        await expect(
          syncBibleTexts('2026-01-01T00:00:00.000Z'),
        ).rejects.toThrow(/Missing bible text chapter\(s\):/i);

        expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_bible_texts',
          expect.stringMatching(
            /Missing bible text chapter\(s\):.*absent from full-fetch response/i,
          ),
        );
        expect(clearSyncErrorMock).not.toHaveBeenCalledWith(
          'sync_error_bible_texts',
        );
      } finally {
        isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      }
    });

    it('treats a full-fetch chapter with empty verses as absent when none are local', async () => {
      mockDbCount(0);
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [],
          },
        ],
      });

      try {
        await expect(syncBibleTexts()).resolves.toEqual({
          coverageIncomplete: true,
        });

        expect(insertBibleTextsMock).toHaveBeenCalledWith([]);
        expect(recordBibleTextAbsencesMock).toHaveBeenCalledWith([
          { bibleId: 10, bookId: 1, chapterNumber: 1 },
        ]);
        // Absences no longer block the remap clear.
        expect(clearBibleTextsServerIdRemapPendingMock).toHaveBeenCalled();
      } finally {
        isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      }
    });

    it('fails on empty verses for a chapter whose verses are already local', async () => {
      mockDbCount(2);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [{ bookId: 1, chapterNumber: 1, verses: [] }],
      });

      await expect(syncBibleTexts()).rejects.toThrow(
        /Missing bible text chapter\(s\):/i,
      );

      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.stringMatching(
          /Missing bible text chapter\(s\):.*empty verses/i,
        ),
      );
    });

    it('treats incremental empty data as success (no missing-chapter failure)', async () => {
      mockDbCount(5);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

      await syncBibleTexts('2026-01-01T00:00:00.000Z');

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        overlapped('2026-01-01T00:00:00.000Z'),
      );
      expect(insertBibleTextsMock).toHaveBeenCalledWith([]);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_bible_texts');
      expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
    });

    it('does not isolate incremental 404 — aborts without fetching later bible groups', async () => {
      mockDbCount(5);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [10, [{ bookId: 1, chapterNumber: 1 }]],
          [20, [{ bookId: 2, chapterNumber: 1 }]],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockRejectedValue(
        new ApiError(404, 'Bible texts not found'),
      );

      await expect(syncBibleTexts('2026-01-01T00:00:00.000Z')).rejects.toThrow(
        /Bible texts not found/,
      );

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(1);
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        overlapped('2026-01-01T00:00:00.000Z'),
      );
      expect(insertBibleTextsMock).not.toHaveBeenCalled();
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.stringMatching(/Bible texts not found/),
      );
    });
  });

  describe('syncBibleTextsForChapters', () => {
    it('uses a dedicated prepare-offline error key, not full bible-text sync', async () => {
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 9001, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      await syncBibleTextsForChapters([
        { bibleId: 10, bookId: 1, chapterNumber: 1 },
      ]);

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(10, [
        { bookId: 1, chapterNumber: 1 },
      ]);
      expect(clearSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_prepare_offline_bible_texts',
      );
      expect(clearSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_bible_texts',
      );
    });

    it('fail-fast on 404 — does not isolate/continue like syncBibleTexts full-fetch', async () => {
      (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
        async (bibleId: number) => {
          if (bibleId === 10) {
            throw new ApiError(404, 'Bible texts not found');
          }
          return {
            data: [
              {
                bookId: 2,
                chapterNumber: 1,
                verses: [{ id: 2001, verseNumber: 1, text: 'Later bible' }],
              },
            ],
          };
        },
      );

      await expect(
        syncBibleTextsForChapters([
          { bibleId: 10, bookId: 1, chapterNumber: 1 },
          { bibleId: 20, bookId: 2, chapterNumber: 1 },
        ]),
      ).rejects.toThrow(/Bible texts not found/);

      const bibleIds = (FluentAPI.getBibleTexts as jest.Mock).mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(bibleIds).toEqual([10]);
      expect(insertBibleTextsMock).not.toHaveBeenCalled();
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_prepare_offline_bible_texts',
        expect.stringMatching(/Bible texts not found/),
      );
      expect(setSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.anything(),
      );
      // Distinct from #177 / #807 full-fetch missing-chapter accumulation.
      expect(setSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_prepare_offline_bible_texts',
        expect.stringMatching(/Missing bible text chapter\(s\):/i),
      );
    });

    it('does not treat empty prepare-offline payloads as full-fetch missing-chapter failures', async () => {
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

      await syncBibleTextsForChapters([
        { bibleId: 10, bookId: 1, chapterNumber: 1 },
      ]);

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(10, [
        { bookId: 1, chapterNumber: 1 },
      ]);
      expect(insertBibleTextsMock).toHaveBeenCalledWith([]);
      expect(clearSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_prepare_offline_bible_texts',
      );
      expect(setSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.anything(),
      );
      expect(setSyncErrorMock).not.toHaveBeenCalledWith(
        'sync_error_prepare_offline_bible_texts',
        expect.stringMatching(/Missing bible text chapter\(s\):/i),
      );
    });
  });

  describe('phase timing instrumentation (#764)', () => {
    const transport = jest.fn();

    function timingContexts(): Record<string, unknown>[] {
      return transport.mock.calls
        .filter(
          ([, tag, message]) =>
            tag === 'SyncPhase' && message === SYNC_PHASE_LOG_MESSAGE,
        )
        .map(([, , , context]) => context as Record<string, unknown>);
    }

    beforeEach(() => {
      transport.mockReset();
      logger.setTransport(transport);
      (getActiveUserId as jest.Mock).mockReturnValue('1');
    });

    afterEach(() => {
      logger.reset();
      jest.restoreAllMocks();
    });

    it('emits allowlisted attempt and total timing without changing auth classification', async () => {
      const now = jest.spyOn(Date, 'now');
      now
        .mockReturnValueOnce(1_000)
        .mockReturnValueOnce(1_000)
        .mockReturnValueOnce(1_025)
        .mockReturnValueOnce(1_040);
      (FluentAPI.getLanguages as jest.Mock).mockRejectedValue(
        new AuthError('User not authenticated'),
      );

      await expect(syncMasterData('session-tok')).rejects.toBeInstanceOf(
        AuthError,
      );

      expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(1);
      expect(setSyncErrorMock).toHaveBeenCalledTimes(1);

      const phases = timingContexts();
      expect(phases.map(entry => entry.phase)).toEqual([
        'Master data sync.attempt',
        'Master data sync.total',
      ]);
      expect(phases[0]).toEqual({
        phase: 'Master data sync.attempt',
        elapsedMs: 25,
        attempt: 1,
      });
      expect(phases[1]).toEqual({
        phase: 'Master data sync.total',
        elapsedMs: 40,
        attempt: 1,
      });
      for (const context of phases) {
        expect(
          Object.keys(context).every(key =>
            (SYNC_PHASE_FIELDS as readonly string[]).includes(key),
          ),
        ).toBe(true);
      }
    });

    it('times each retry attempt plus total and preserves transient classification', async () => {
      jest.useFakeTimers();
      (FluentAPI.getLanguages as jest.Mock).mockRejectedValue(
        new ApiError(0, 'Unable to resolve host api.fluent.bible'),
      );

      try {
        const pending = syncMasterData();
        const expectation = expect(pending).rejects.toThrow(
          'Unable to resolve host api.fluent.bible',
        );
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;
      } finally {
        jest.useRealTimers();
      }

      expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(3);
      expect(setSyncErrorMock).not.toHaveBeenCalled();

      const phases = timingContexts().map(entry => entry.phase);
      expect(phases).toEqual([
        'Master data sync.attempt',
        'Master data sync.attempt',
        'Master data sync.attempt',
        'Master data sync.total',
      ]);
      expect(
        timingContexts()
          .filter(entry => entry.phase === 'Master data sync.attempt')
          .map(entry => entry.attempt),
      ).toEqual([1, 2, 3]);
      expect(
        timingContexts().find(entry => entry.phase === 'Master data sync.total')
          ?.attempt,
      ).toBe(3);
    });

    it('records count check, combined fetchParse, write, and fullFetchReason', async () => {
      mockDbCount(0);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 9001, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      await syncBibleTexts('2026-01-01T00:00:00.000Z');

      const phases = timingContexts();
      expect(phases.map(entry => entry.phase)).toEqual([
        BIBLE_TEXT_PHASE.reentry,
        BIBLE_TEXT_PHASE.countCheck,
        BIBLE_TEXT_PHASE.fetchParse,
        BIBLE_TEXT_PHASE.write,
        'Bible text sync.attempt',
        'Bible text sync.total',
      ]);
      expect(
        phases.find(entry => entry.phase === BIBLE_TEXT_PHASE.countCheck),
      ).toEqual(
        expect.objectContaining({
          rows: 1,
          chunks: 0,
          fullFetchReason: 'missing_chapter',
        }),
      );
      expect(
        phases.find(entry => entry.phase === BIBLE_TEXT_PHASE.fetchParse),
      ).toEqual(
        expect.objectContaining({
          rows: 1,
          chunks: 0,
          fullFetchReason: 'missing_chapter',
        }),
      );
      expect(
        phases.find(entry => entry.phase === BIBLE_TEXT_PHASE.write),
      ).toEqual(
        expect.objectContaining({
          rows: 1,
          chunks: 0,
          fullFetchReason: 'missing_chapter',
        }),
      );
      const serialized = JSON.stringify(phases);
      expect(serialized).not.toMatch(
        /In the beginning|user@|Bearer|token|9001/i,
      );
      for (const context of phases) {
        expect(
          Object.keys(context).every(key =>
            (SYNC_PHASE_FIELDS as readonly string[]).includes(key),
          ),
        ).toBe(true);
      }
    });

    it('labels remap and no_cursor full-fetch reasons', async () => {
      mockDbCount(2);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 9001, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      isBibleTextsServerIdRemapPendingMock.mockReturnValue(true);
      await syncBibleTexts('2026-01-01T00:00:00.000Z');
      expect(
        timingContexts().find(
          entry => entry.phase === BIBLE_TEXT_PHASE.fetchParse,
        )?.fullFetchReason,
      ).toBe('remap');
      expect(
        timingContexts().some(
          entry => entry.phase === BIBLE_TEXT_PHASE.countCheck,
        ),
      ).toBe(false);

      transport.mockClear();
      isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      await syncBibleTexts();
      expect(
        timingContexts().find(
          entry => entry.phase === BIBLE_TEXT_PHASE.fetchParse,
        )?.fullFetchReason,
      ).toBe('no_cursor');

      transport.mockClear();
      mockDbCount(2);
      await syncBibleTexts('2026-01-01T00:00:00.000Z');
      expect(
        timingContexts().find(
          entry => entry.phase === BIBLE_TEXT_PHASE.fetchParse,
        )?.fullFetchReason,
      ).toBeUndefined();
      expect(
        timingContexts().some(
          entry => entry.phase === BIBLE_TEXT_PHASE.countCheck,
        ),
      ).toBe(true);
    });

    it('omits fullFetchReason on incremental warm fetch and still times countCheck', async () => {
      mockDbCount(12);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
        data: [
          {
            bookId: 1,
            chapterNumber: 1,
            verses: [{ id: 9001, verseNumber: 1, text: 'In the beginning' }],
          },
        ],
      });

      await syncBibleTexts('2026-01-01T00:00:00.000Z');

      const countCheck = timingContexts().find(
        entry => entry.phase === BIBLE_TEXT_PHASE.countCheck,
      );
      const fetchParse = timingContexts().find(
        entry => entry.phase === BIBLE_TEXT_PHASE.fetchParse,
      );
      expect(countCheck).toEqual(
        expect.objectContaining({
          rows: 1,
          chunks: 0,
        }),
      );
      expect(countCheck).not.toHaveProperty('fullFetchReason');
      expect(fetchParse).toEqual(
        expect.objectContaining({
          rows: 1,
          chunks: 0,
        }),
      );
      expect(fetchParse).not.toHaveProperty('fullFetchReason');
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        overlapped('2026-01-01T00:00:00.000Z'),
      );
    });

    it('full-fetches only chapters with no local verses and keeps the cursor for the rest', async () => {
      (getDatabase as jest.Mock).mockReturnValue({
        execute: jest.fn(async (sql: string, params?: unknown[]) => {
          if (sql.includes('COUNT(DISTINCT bible_id)')) {
            return { rows: [{ count: 1 }] };
          }
          const chapterNumber = params?.[2];
          return { rows: [{ count: chapterNumber === 2 ? 0 : 8 }] };
        }),
      });
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [
            10,
            [
              { bookId: 1, chapterNumber: 1 },
              { bookId: 1, chapterNumber: 2 },
            ],
          ],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
        async (
          _bibleId: number,
          requested: Array<{ bookId: number; chapterNumber: number }>,
        ) => ({
          data: requested.map(chapter => ({
            bookId: chapter.bookId,
            chapterNumber: chapter.chapterNumber,
            verses: [
              {
                id: chapter.chapterNumber * 100,
                verseNumber: 1,
                text: 'verse',
              },
            ],
          })),
        }),
      );

      await syncBibleTexts('2026-01-01T00:00:00.000Z');

      expect(FluentAPI.getBibleTexts).toHaveBeenNthCalledWith(
        1,
        10,
        [{ bookId: 1, chapterNumber: 2 }],
        undefined,
      );
      expect(FluentAPI.getBibleTexts).toHaveBeenNthCalledWith(
        2,
        10,
        [{ bookId: 1, chapterNumber: 1 }],
        overlapped('2026-01-01T00:00:00.000Z'),
      );
      expect(recordBibleTextAbsencesMock).not.toHaveBeenCalled();
    });

    describe('syncBibleTexts cursor result (#886)', () => {
      const presentDb = () =>
        (getDatabase as jest.Mock).mockReturnValue({
          execute: jest.fn(async () => ({ rows: [{ count: 8 }] })),
        });
      const verses = (chapterNumber: number) => [
        { id: chapterNumber * 100, verseNumber: 1, text: 'verse' },
      ];

      describe('client-only watermark recovery against the existing backend', () => {
        const NOW = Date.parse('2026-02-01T00:00:00.000Z');
        const CURSOR = '2026-01-10T00:00:00.000Z';
        type Row = {
          chapterNumber: number;
          id: number;
          updatedAt: string;
        };
        const fullAt = new Map<string, number>();
        let serverRows: Row[] = [];
        let serverFailsIncremental = false;

        // fluent-api main: strict `updatedAt > updatedAfter`, `syncedAt`
        // taken after the query, and a repository error with a cursor is
        // answered as a successful empty payload.
        const fakeBulkTexts = async (
          _bibleId: number,
          requested: Array<{ bookId: number; chapterNumber: number }>,
          updatedAfter?: string,
        ) => {
          if (updatedAfter && serverFailsIncremental) {
            return { syncedAt: new Date(NOW).toISOString(), data: [] };
          }
          const after = updatedAfter ? Date.parse(updatedAfter) : -Infinity;
          const data = requested
            .map(chapter => ({
              bookId: chapter.bookId,
              chapterNumber: chapter.chapterNumber,
              verses: serverRows
                .filter(
                  row =>
                    row.chapterNumber === chapter.chapterNumber &&
                    Date.parse(row.updatedAt) > after,
                )
                .map(row => ({ id: row.id, verseNumber: 1, text: 'v' })),
            }))
            .filter(chapter => chapter.verses.length > 0);
          return { syncedAt: new Date(NOW).toISOString(), data };
        };
        const insertedVerseIds = () =>
          insertBibleTextsMock.mock.calls.flatMap(([books]) =>
            (books as Array<{ verses: Array<{ id: number }> }>).flatMap(book =>
              book.verses.map(verse => verse.id),
            ),
          );
        const chapters = (count: number) =>
          Array.from({ length: count }, (_, i) => ({
            bookId: 1,
            chapterNumber: i + 1,
          }));

        let nowSpy: jest.SpyInstance;
        beforeEach(() => {
          presentDb();
          fullAt.clear();
          serverRows = [];
          serverFailsIncremental = false;
          insertBibleTextsMock.mockClear();
          nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
          const storage = jest.requireMock('./storage');
          storage.getBibleTextChapterSyncedAt.mockImplementation(() => CURSOR);
          storage.getBibleTextChapterFullReconcileAt.mockImplementation(
            (bibleId: number, bookId: number, chapter: number) =>
              fullAt.get(`${bibleId}:${bookId}:${chapter}`) ?? null,
          );
          storage.setBibleTextChapterFullReconcileAt.mockImplementation(
            (bibleId: number, bookId: number, chapter: number, ms: number) =>
              fullAt.set(`${bibleId}:${bookId}:${chapter}`, ms),
          );
          (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
            fakeBulkTexts,
          );
        });
        afterEach(() => {
          nowSpy.mockRestore();
          const storage = jest.requireMock('./storage');
          storage.getBibleTextChapterSyncedAt.mockImplementation(
            () => '2026-01-01T00:00:00.000Z',
          );
          storage.getBibleTextChapterFullReconcileAt.mockImplementation(
            () => null,
          );
          storage.setBibleTextChapterFullReconcileAt.mockReset();
          storage.setBibleTextChapterSyncedAt.mockReset();
        });

        it('recovers a row committed after the cursor but stamped inside the overlap', async () => {
          getChaptersToSyncMock.mockResolvedValue(new Map([[10, chapters(1)]]));
          fullAt.set('10:1:1', NOW - 60_000);
          // Stamped 2 minutes before the cursor the client already holds.
          serverRows = [
            {
              chapterNumber: 1,
              id: 501,
              updatedAt: new Date(Date.parse(CURSOR) - 120_000).toISOString(),
            },
          ];

          await syncBibleTexts(CURSOR);

          expect(insertedVerseIds()).toEqual([501]);
        });

        it('a gap beyond the overlap waits for the scheduled full reconcile (residual limit)', async () => {
          getChaptersToSyncMock.mockResolvedValue(new Map([[10, chapters(2)]]));
          // Chapter 1 reconciled yesterday; chapter 2 eight days ago.
          fullAt.set('10:1:1', NOW - 24 * 3600_000);
          fullAt.set('10:1:2', NOW - 8 * 24 * 3600_000);
          const twoHoursBefore = new Date(
            Date.parse(CURSOR) - 2 * 3600_000,
          ).toISOString();
          serverRows = [
            { chapterNumber: 1, id: 601, updatedAt: twoHoursBefore },
            { chapterNumber: 2, id: 602, updatedAt: twoHoursBefore },
          ];

          await syncBibleTexts(CURSOR);

          expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
            10,
            [{ bookId: 1, chapterNumber: 2 }],
            undefined,
          );
          expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
            10,
            [{ bookId: 1, chapterNumber: 1 }],
            overlapped(CURSOR),
          );
          // Chapter 1's late row stays missing until its own reconcile is due.
          expect(insertedVerseIds()).toEqual([602]);
          expect(fullAt.get('10:1:2')).toBe(NOW);
          expect(fullAt.get('10:1:1')).toBe(NOW - 24 * 3600_000);
        });

        it(`full-reconciles at most ${BIBLE_TEXT_FULL_RECONCILE_BUDGET} chapters per pass`, async () => {
          getChaptersToSyncMock.mockResolvedValue(
            new Map([[10, chapters(BIBLE_TEXT_FULL_RECONCILE_BUDGET + 5)]]),
          );
          for (
            let ch = 1;
            ch <= BIBLE_TEXT_FULL_RECONCILE_BUDGET + 5;
            ch += 1
          ) {
            fullAt.set(`10:1:${ch}`, NOW - 30 * 24 * 3600_000);
            serverRows.push({
              chapterNumber: ch,
              id: 800 + ch,
              updatedAt: '2025-06-01T00:00:00.000Z',
            });
          }

          await syncBibleTexts(CURSOR);

          const calls = (FluentAPI.getBibleTexts as jest.Mock).mock.calls;
          const full = calls.filter(call => call[2] === undefined);
          const incremental = calls.filter(call => call[2] !== undefined);
          expect(full).toHaveLength(1);
          expect(full[0][1]).toHaveLength(BIBLE_TEXT_FULL_RECONCILE_BUDGET);
          expect(incremental).toHaveLength(1);
          expect(incremental[0][1]).toHaveLength(5);
        });

        it(`drains a backlog ${BIBLE_TEXT_FULL_RECONCILE_BUDGET} chapters per pass, so N due chapters take ceil(N/${BIBLE_TEXT_FULL_RECONCILE_BUDGET}) passes`, async () => {
          const due = BIBLE_TEXT_FULL_RECONCILE_BUDGET * 2 + 3;
          getChaptersToSyncMock.mockResolvedValue(
            new Map([[10, chapters(due)]]),
          );
          for (let ch = 1; ch <= due; ch += 1) {
            fullAt.set(
              `10:1:${ch}`,
              NOW - BIBLE_TEXT_FULL_RECONCILE_MAX_AGE_MS,
            );
            serverRows.push({
              chapterNumber: ch,
              id: 1000 + ch,
              updatedAt: '2025-06-01T00:00:00.000Z',
            });
          }
          const fullFetched: number[][] = [];
          for (let pass = 0; pass < 4; pass += 1) {
            (FluentAPI.getBibleTexts as jest.Mock).mockClear();
            await syncBibleTexts(CURSOR);
            fullFetched.push(
              (FluentAPI.getBibleTexts as jest.Mock).mock.calls
                .filter(call => call[2] === undefined)
                .flatMap(call =>
                  (call[1] as Array<{ chapterNumber: number }>).map(
                    c => c.chapterNumber,
                  ),
                ),
            );
          }

          expect(fullFetched.map(chs => chs.length)).toEqual([
            BIBLE_TEXT_FULL_RECONCILE_BUDGET,
            BIBLE_TEXT_FULL_RECONCILE_BUDGET,
            3,
            0,
          ]);
          expect(new Set(fullFetched.flat()).size).toBe(due);
          for (const ms of fullAt.values()) expect(ms).toBe(NOW);
        });

        it('first run after upgrade seeds staggered reconcile times instead of full-fetching every chapter', async () => {
          getChaptersToSyncMock.mockResolvedValue(new Map([[10, chapters(3)]]));

          await syncBibleTexts(CURSOR);

          const calls = (FluentAPI.getBibleTexts as jest.Mock).mock.calls;
          expect(calls.every(call => call[2] === overlapped(CURSOR))).toBe(
            true,
          );
          expect(fullAt.size).toBe(3);
          for (const ms of fullAt.values()) {
            expect(ms).toBeLessThanOrEqual(NOW);
            expect(ms).toBeGreaterThan(
              NOW - BIBLE_TEXT_FULL_RECONCILE_MAX_AGE_MS,
            );
          }
        });

        it('upgrading from main full-fetches uncovered chapters once and staggers their next reconcile', async () => {
          getChaptersToSyncMock.mockResolvedValue(new Map([[10, chapters(4)]]));
          const storage = jest.requireMock('./storage');
          storage.getBibleTextChapterSyncedAt.mockImplementation(() => null);
          serverRows = [1, 2, 3, 4].map(ch => ({
            chapterNumber: ch,
            id: 900 + ch,
            updatedAt: '2025-06-01T00:00:00.000Z',
          }));

          await syncBibleTexts(CURSOR);

          const calls = (FluentAPI.getBibleTexts as jest.Mock).mock.calls;
          expect(calls.every(call => call[2] === undefined)).toBe(true);
          const stamps = [...fullAt.values()];
          expect(stamps).toHaveLength(4);
          expect(new Set(stamps).size).toBe(4);
          for (const ms of stamps) {
            expect(ms).toBeLessThanOrEqual(NOW);
            expect(ms).toBeGreaterThan(
              NOW - BIBLE_TEXT_FULL_RECONCILE_MAX_AGE_MS,
            );
          }
        });

        it('writes the pass coverage in one KV batch, after the verses (#886)', async () => {
          getChaptersToSyncMock.mockResolvedValue(new Map([[10, chapters(4)]]));
          const storage = jest.requireMock('./storage');
          storage.getBibleTextChapterSyncedAt.mockImplementation(() => null);
          serverRows = [1, 2, 3, 4].map(ch => ({
            chapterNumber: ch,
            id: 900 + ch,
            updatedAt: '2025-06-01T00:00:00.000Z',
          }));
          const { runKvBatchSync } = jest.requireMock('./kvBatch') as {
            runKvBatchSync: jest.Mock;
          };
          runKvBatchSync.mockClear();
          const depths: number[] = [];
          storage.setBibleTextChapterSyncedAt.mockImplementation(() => {
            depths.push(mockKvBatchDepth);
          });
          storage.setBibleTextChapterFullReconcileAt.mockImplementation(() => {
            depths.push(mockKvBatchDepth);
          });

          await syncBibleTexts(CURSOR);

          expect(runKvBatchSync).toHaveBeenCalledTimes(1);
          expect(depths).toHaveLength(8);
          expect(depths.every(depth => depth === 1)).toBe(true);
          expect(storage.setBibleTextChapterSyncedAt.mock.calls).toEqual(
            [1, 2, 3, 4].map(ch => [10, 1, ch, new Date(NOW).toISOString()]),
          );
          const versesDone = Math.max(
            ...insertBibleTextsMock.mock.invocationCallOrder,
          );
          expect(runKvBatchSync.mock.invocationCallOrder[0]).toBeGreaterThan(
            versesDone,
          );
        });

        it('an error answered as an empty incremental never advances coverage; the next pass re-asks', async () => {
          getChaptersToSyncMock.mockResolvedValue(new Map([[10, chapters(1)]]));
          fullAt.set('10:1:1', NOW - 60_000);
          serverRows = [
            {
              chapterNumber: 1,
              id: 701,
              updatedAt: '2026-01-20T00:00:00.000Z',
            },
          ];
          serverFailsIncremental = true;
          const storage = jest.requireMock('./storage');

          await expect(syncBibleTexts(CURSOR)).resolves.toEqual({
            coverageIncomplete: true,
          });
          expect(storage.setBibleTextChapterSyncedAt).not.toHaveBeenCalled();
          expect(insertedVerseIds()).toEqual([]);

          serverFailsIncremental = false;
          await syncBibleTexts(CURSOR);
          expect(insertedVerseIds()).toEqual([701]);
          expect(storage.setBibleTextChapterSyncedAt).toHaveBeenCalledWith(
            10,
            1,
            1,
            new Date(NOW).toISOString(),
          );
        });
      });

      it('returns the earliest server syncedAt across usable responses', async () => {
        presentDb();
        getChaptersToSyncMock.mockResolvedValue(
          new Map([
            [10, [{ bookId: 1, chapterNumber: 1 }]],
            [11, [{ bookId: 1, chapterNumber: 1 }]],
          ]),
        );
        (FluentAPI.getBibleTexts as jest.Mock)
          .mockResolvedValueOnce({
            syncedAt: '2026-01-05T00:00:00.000Z',
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          })
          .mockResolvedValueOnce({
            syncedAt: '2026-01-04T00:00:00.000Z',
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          });

        await expect(
          syncBibleTexts('2026-01-01T00:00:00.000Z'),
        ).resolves.toEqual({ syncedAt: '2026-01-04T00:00:00.000Z' });
      });

      it('holds shared coverage when one incremental group is empty', async () => {
        presentDb();
        getChaptersToSyncMock.mockResolvedValue(
          new Map([
            [10, [{ bookId: 1, chapterNumber: 1 }]],
            [11, [{ bookId: 1, chapterNumber: 1 }]],
          ]),
        );
        (FluentAPI.getBibleTexts as jest.Mock)
          // Empty incremental — may be a masked repository error; not usable.
          .mockResolvedValueOnce({
            syncedAt: '2026-01-02T00:00:00.000Z',
            data: [],
          })
          .mockResolvedValueOnce({
            syncedAt: '2026-01-06T00:00:00.000Z',
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          });

        await expect(
          syncBibleTexts('2026-01-01T00:00:00.000Z'),
        ).resolves.toEqual({ coverageIncomplete: true });
      });

      it('advances healthy chapter coverage while retrying an empty sibling from its earlier cursor', async () => {
        presentDb();
        const coverage = new Map([
          [10, '2026-01-01T00:00:00.000Z'],
          [11, '2026-01-01T00:00:00.000Z'],
        ]);
        const storage = jest.requireMock('./storage');
        storage.getBibleTextChapterSyncedAt.mockImplementation(
          (bibleId: number) => coverage.get(bibleId) ?? '',
        );
        storage.setBibleTextChapterSyncedAt.mockImplementation(
          (bibleId: number, _book: number, _chapter: number, cursor: string) =>
            coverage.set(bibleId, cursor),
        );
        getChaptersToSyncMock.mockResolvedValue(
          new Map([
            [10, [{ bookId: 1, chapterNumber: 1 }]],
            [11, [{ bookId: 1, chapterNumber: 1 }]],
          ]),
        );
        (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
          async (bibleId: number) => ({
            syncedAt: '2026-01-06T00:00:00.000Z',
            data:
              bibleId === 10
                ? []
                : [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          }),
        );
        try {
          await expect(
            syncBibleTexts('2026-01-01T00:00:00.000Z'),
          ).resolves.toEqual({ coverageIncomplete: true });
          expect(coverage.get(10)).toBe('2026-01-01T00:00:00.000Z');
          expect(coverage.get(11)).toBe('2026-01-06T00:00:00.000Z');
          (FluentAPI.getBibleTexts as jest.Mock).mockClear();
          await syncBibleTexts('2026-01-01T00:00:00.000Z');
          expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
            10,
            expect.any(Array),
            overlapped('2026-01-01T00:00:00.000Z'),
          );
          expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
            11,
            expect.any(Array),
            overlapped('2026-01-06T00:00:00.000Z'),
          );
        } finally {
          storage.getBibleTextChapterSyncedAt.mockImplementation(
            () => '2026-01-01T00:00:00.000Z',
          );
          storage.setBibleTextChapterSyncedAt.mockReset();
        }
      });

      it('full-fetches restored cached chapters without durable coverage evidence', async () => {
        presentDb();
        const storage = jest.requireMock('./storage');
        storage.getBibleTextChapterSyncedAt.mockReturnValue('');
        getChaptersToSyncMock.mockResolvedValue(
          new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
        );
        (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
          syncedAt: '2026-01-06T00:00:00.000Z',
          data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
        });
        try {
          await syncBibleTexts('2026-01-05T00:00:00.000Z');
          expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
            10,
            expect.any(Array),
            undefined,
          );
        } finally {
          storage.getBibleTextChapterSyncedAt.mockImplementation(
            () => '2026-01-01T00:00:00.000Z',
          );
        }
      });

      it('returns no cursor when every incremental response was empty', async () => {
        presentDb();
        getChaptersToSyncMock.mockResolvedValue(
          new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
        );
        (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
          syncedAt: '2026-01-02T00:00:00.000Z',
          data: [],
        });

        await expect(
          syncBibleTexts('2026-01-01T00:00:00.000Z'),
        ).resolves.toEqual({ coverageIncomplete: true });
      });

      it('counts an empty full-fetch response as usable (absence is server state)', async () => {
        // No local verses: the chapter is recorded absent, not a regression.
        (getDatabase as jest.Mock).mockReturnValue({
          execute: jest.fn(async () => ({ rows: [{ count: 0 }] })),
        });
        getChaptersToSyncMock.mockResolvedValue(
          new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
        );
        (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
          syncedAt: '2026-01-02T00:00:00.000Z',
          data: [],
        });

        await expect(syncBibleTexts()).resolves.toEqual({
          syncedAt: '2026-01-02T00:00:00.000Z',
        });
      });

      it('returns no cursor when a usable response lacks server syncedAt', async () => {
        presentDb();
        getChaptersToSyncMock.mockResolvedValue(
          new Map([
            [10, [{ bookId: 1, chapterNumber: 1 }]],
            [11, [{ bookId: 1, chapterNumber: 1 }]],
          ]),
        );
        (FluentAPI.getBibleTexts as jest.Mock)
          .mockResolvedValueOnce({
            syncedAt: '2026-01-05T00:00:00.000Z',
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          })
          .mockResolvedValueOnce({
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          });

        await expect(syncBibleTexts()).resolves.toEqual({
          coverageIncomplete: true,
        });
      });

      it('does not carry a cursor from a failed attempt into the retry', async () => {
        jest.useFakeTimers();
        presentDb();
        getChaptersToSyncMock.mockResolvedValue(
          new Map([
            [10, [{ bookId: 1, chapterNumber: 1 }]],
            [11, [{ bookId: 1, chapterNumber: 1 }]],
          ]),
        );
        (FluentAPI.getBibleTexts as jest.Mock)
          .mockResolvedValueOnce({
            syncedAt: '2026-01-01T00:00:00.000Z',
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          })
          .mockRejectedValueOnce(new Error('transient'))
          .mockResolvedValueOnce({
            syncedAt: '2026-01-09T00:00:00.000Z',
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          })
          .mockResolvedValueOnce({
            syncedAt: '2026-01-08T00:00:00.000Z',
            data: [{ bookId: 1, chapterNumber: 1, verses: verses(1) }],
          });

        const pending = syncBibleTexts();
        await jest.runAllTimersAsync();

        await expect(pending).resolves.toEqual({
          syncedAt: '2026-01-08T00:00:00.000Z',
        });
        jest.useRealTimers();
      });
    });

    it('records chunks already committed before a retry without changing order', async () => {
      jest.useFakeTimers();
      getChaptersToSyncMock.mockResolvedValue(
        new Map([
          [10, [{ bookId: 1, chapterNumber: 1 }]],
          [20, [{ bookId: 2, chapterNumber: 1 }]],
        ]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
        async (bibleId: number) => ({
          data: [
            {
              bookId: bibleId === 10 ? 1 : 2,
              chapterNumber: 1,
              verses: [
                {
                  id: bibleId * 100,
                  verseNumber: 1,
                  text: 'secret verse text',
                },
              ],
            },
          ],
        }),
      );
      insertBibleTextsMock.mockImplementation(async rows => {
        if (rows[0]?.bibleId === 20) {
          throw new ApiError(500, 'write failed');
        }
      });

      try {
        const pending = syncBibleTexts();
        const expectation = expect(pending).rejects.toThrow('write failed');
        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;
      } finally {
        jest.useRealTimers();
      }

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(6);
      expect(insertBibleTextsMock).toHaveBeenCalledTimes(6);
      expect(
        timingContexts()
          .filter(entry => entry.phase === BIBLE_TEXT_PHASE.reentry)
          .map(entry => entry.chunks),
      ).toEqual([0, 1, 1]);
      const serialized = JSON.stringify(timingContexts());
      expect(serialized).not.toMatch(/secret verse text|user@|Bearer/i);
    });
  });
});

describe('syncAllUsers displayMode device-local (#777)', () => {
  const { userHasLocalProjects, userHasLocalChapterAssignments } =
    jest.requireMock('../db/repository') as {
      userHasLocalProjects: jest.Mock;
      userHasLocalChapterAssignments: jest.Mock;
    };
  const getChaptersToSyncMockLocal = jest.mocked(getChaptersToSync);

  beforeEach(() => {
    jest.clearAllMocks();
    __resetFullSyncSingleFlightForTests();
    jest.spyOn(syncEvents, 'emitAuthReauthRequired');
    jest.spyOn(syncEvents, 'emitSyncStart').mockImplementation(() => {});
    jest.spyOn(syncEvents, 'emitSyncComplete').mockImplementation(() => {});

    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getKnownUserIds as jest.Mock).mockReturnValue(['1', '2']);
    (getLastSyncedAt as jest.Mock).mockReturnValue('2026-06-01T00:00:00.000Z');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalProjects.mockResolvedValue(true);
    userHasLocalChapterAssignments.mockResolvedValue(true);
    getChaptersToSyncMockLocal.mockResolvedValue(new Map());
    getConnectivitySnapshotMock.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    syncPendingChapterClaimsMock.mockResolvedValue({
      synced: 0,
      conflicts: 0,
      failed: 0,
    });
    syncPendingStageAdvancesMock.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetFullSyncSingleFlightForTests();
  });

  it('does not call /self/settings when remote advertises displayMode capability', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (FluentAPI.getSelfSettings as jest.Mock).mockResolvedValue({
      settings: { displayMode: 'verse', suppressTooltip: true },
      updatedAt: '2026-01-01T00:00:00.000Z',
      settingsCapabilities: { partialMerge: true, displayMode: true },
    });

    await syncAllUsers();

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(2);
    expect(FluentAPI.getSelfSettings).not.toHaveBeenCalled();
    expect(FluentAPI.putSelfSettings).not.toHaveBeenCalled();
    expect(syncPendingStageAdvancesMock).toHaveBeenCalledWith(
      1,
      'user-1-token',
    );
    expect(syncPendingStageAdvancesMock).toHaveBeenCalledWith(
      2,
      'user-2-token',
    );
    const claimsOrder =
      syncPendingChapterClaimsMock.mock.invocationCallOrder[0];
    const assignmentOrder = (FluentAPI.getChapterAssignments as jest.Mock).mock
      .invocationCallOrder[0];
    const stageOrder = syncPendingStageAdvancesMock.mock.invocationCallOrder[0];
    expect(claimsOrder).toBeLessThan(assignmentOrder);
    expect(assignmentOrder).toBeLessThan(stageOrder);
  });
});
