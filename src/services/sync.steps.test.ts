import { ApiError } from '../types/api/errors';
import { FluentAPI } from './api';
import { AuthError } from './authError';
import {
  __resetFullSyncSingleFlightForTests,
  syncAllUsers,
  syncBibleTexts,
  syncBibleTextsForChapters,
  syncChapterAssignments,
  syncMasterData,
  syncPendingChapterClaimsForUser,
  syncProjects,
} from './sync';
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
} from './storage';
import * as syncEvents from './syncEvents';
import { getDatabase } from '../db/db';
import {
  getChaptersToSync,
  getRecordingLinkedChaptersToSync,
  insertBibleTexts,
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

jest.mock('./connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
}));

jest.mock('./chapterClaimSync', () => ({
  syncPendingChapterClaims: jest.fn(),
  reconcilePendingClaimsAfterAssignmentPull: jest
    .fn()
    .mockResolvedValue({ conflicts: 0 }),
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

jest.mock('./keychain', () => ({
  clearCredentials: jest.fn().mockResolvedValue(undefined),
  getCredentials: jest.fn(),
  getTempCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  clearTempCredentials: jest.fn(),
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
  getKnownUserIds: jest.fn(),
  getUserLastSyncedAt: jest.fn(),
  setUserLastSyncedAt: jest.fn(),
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
  getChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getMyWorkChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getRecordingLinkedChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getLocalProjectIds: jest.fn().mockResolvedValue([1]),
  hasLanguagesMissingIsoCode: jest.fn().mockResolvedValue(false),
  userHasLocalProjects: jest.fn().mockResolvedValue(true),
  userHasLocalChapterAssignments: jest.fn().mockResolvedValue(true),
  userNeedsAssigneeRepair: jest.fn().mockResolvedValue(false),
  insertUser: jest.fn().mockResolvedValue(undefined),
  insertPericopeSets: jest.fn().mockResolvedValue(undefined),
  getProjectPericopeSetId: jest.fn().mockResolvedValue(null),
  getChaptersNeedingPericopeSync: jest.fn().mockResolvedValue([]),
  upsertPericopeSet: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../db/db', () => ({
  getDatabase: jest.fn(() => ({
    execute: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
  })),
}));

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
const getChaptersToSyncMock = jest.mocked(getChaptersToSync);
const getRecordingLinkedChaptersToSyncMock = jest.mocked(
  getRecordingLinkedChaptersToSync,
);
const setSyncErrorMock = jest.mocked(setSyncError);
const clearSyncErrorMock = jest.mocked(clearSyncError);
const setSyncCountMock = jest.mocked(setSyncCount);
const getConnectivitySnapshotMock = jest.mocked(getConnectivitySnapshot);
const syncPendingChapterClaimsMock = jest.mocked(syncPendingChapterClaims);
const isBibleTextsServerIdRemapPendingMock = jest.mocked(
  isBibleTextsServerIdRemapPending,
);
const clearBibleTextsServerIdRemapPendingMock = jest.mocked(
  clearBibleTextsServerIdRemapPending,
);
const getMasterDataLastSyncedAtMock = jest.mocked(getMasterDataLastSyncedAt);
const setMasterDataLastSyncedAtMock = jest.mocked(setMasterDataLastSyncedAt);

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
  });

  describe('syncMasterData', () => {
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
      expect(setMasterDataLastSyncedAtMock).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_master_data');
    });

    it('passes the stored cursor as updatedAfter for incremental sync', async () => {
      const cursor = '2026-06-01T00:00:00.000Z';
      getMasterDataLastSyncedAtMock.mockReturnValue(cursor);
      (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);

      await syncMasterData();

      expect(FluentAPI.getLanguages).toHaveBeenCalledWith(cursor, undefined);
      expect(FluentAPI.getBooks).toHaveBeenCalledWith(cursor, undefined);
      expect(FluentAPI.getBibles).toHaveBeenCalledWith(cursor, undefined);
      expect(insertMasterDataMock).toHaveBeenCalledWith([], [], []);
      expect(setMasterDataLastSyncedAtMock).toHaveBeenCalledWith(
        expect.any(String),
      );
    });

    it('omits updatedAfter when forceFull is set', async () => {
      getMasterDataLastSyncedAtMock.mockReturnValue('2026-06-01T00:00:00.000Z');

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
      } finally {
        jest.useRealTimers();
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

      await syncChapterAssignments(2, '2026-06-01T00:00:00.000Z');

      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
        2,
        '2026-06-01T00:00:00.000Z',
        undefined,
        undefined,
      );
      expect(insertChapterAssignmentSyncDataMock).toHaveBeenCalledWith([
        expect.objectContaining({
          chapterAssignmentId: 11,
          projectId: 5,
          chapterStatus: 'in_progress',
        }),
      ]);
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

      expect(syncPendingChapterClaimsMock).toHaveBeenCalledWith(9);
      expect(clearSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_chapter_claims',
      );
    });

    it('skips syncing pending offline claims when offline', async () => {
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
      });

      expect(syncPendingChapterClaimsMock).not.toHaveBeenCalled();
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
    it('short-circuits when there are no chapters to sync', async () => {
      await syncBibleTexts();

      expect(FluentAPI.getBibleTexts).not.toHaveBeenCalled();
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_bibles', 0);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_bible_texts');
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

    it('records all-empty full-fetch 404 as missing chapters and fails the step', async () => {
      mockDbCount(0);
      getChaptersToSyncMock.mockResolvedValue(
        new Map([[10, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
      (FluentAPI.getBibleTexts as jest.Mock).mockRejectedValue(
        new ApiError(404, 'Bible texts not found'),
      );

      await expect(syncBibleTexts()).rejects.toThrow(
        /Missing bible text chapter\(s\):/i,
      );

      expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(1);
      expect(insertBibleTextsMock).not.toHaveBeenCalled();
      expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
      expect(setSyncErrorMock).toHaveBeenCalledWith(
        'sync_error_bible_texts',
        expect.stringMatching(/Missing bible text chapter\(s\):.*404/i),
      );
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
      mockDbCount(0);
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

    it('treats full-fetch chapter with empty verses as missing', async () => {
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
        await expect(syncBibleTexts()).rejects.toThrow(
          /Missing bible text chapter\(s\):/i,
        );

        expect(insertBibleTextsMock).toHaveBeenCalledWith([]);
        expect(clearBibleTextsServerIdRemapPendingMock).not.toHaveBeenCalled();
        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_bible_texts',
          expect.stringMatching(
            /Missing bible text chapter\(s\):.*empty verses/i,
          ),
        );
      } finally {
        isBibleTextsServerIdRemapPendingMock.mockReturnValue(false);
      }
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
        '2026-01-01T00:00:00.000Z',
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
        '2026-01-01T00:00:00.000Z',
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
  });
});
