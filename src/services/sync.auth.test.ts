import { AuthError } from './authError';
import { ApiError } from '../types/api/errors';
import { waitFor } from '@testing-library/react-native';
import { FluentAPI } from './api';
import { authToken } from './authToken';
import { logger } from '../utils/logger';
import {
  getChapterAssignmentPullRevision,
  markChapterCompleteConfirmed,
} from '../utils/chapterCompletionSyncGuard';
import {
  clearCredentials,
  getCredentials,
  getTempCredentials,
} from './keychain';
import {
  __resetFullSyncSingleFlightForTests,
  __resetMetadataRefreshFreshnessForTests,
  BIBLE_TEXT_CURSOR_OVERLAP_MS,
  CATALOGUE_REFRESH_QUIET_MS,
  METADATA_REFRESH_FRESH_MS,
  refreshChapterMetadataIfOnline,
  refreshPrepareOfflineReferencedParents,
  syncAllData,
  syncAllUsers,
  syncPendingChapterClaimsForUser,
  syncPendingStageAdvancesForUser,
} from './sync';

/** Incremental text requests rewind the chapter cursor (#886). */
const overlapped = (iso: string): string =>
  new Date(Date.parse(iso) - BIBLE_TEXT_CURSOR_OVERLAP_MS).toISOString();
import * as sync from './sync';
import * as syncEvents from './syncEvents';
import { getConnectivitySnapshot } from './connectivity';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserLastSyncedAt,
  setUserLastSyncedAt,
  clearCatalogueQuietSince,
  getCatalogueQuietSince,
  setCatalogueQuietSince,
  getUserBibleTextSyncedAt,
  setUserBibleTextSyncedAt,
  getLastAssignmentSyncAt,
  getLastSyncedAt,
  getUserIdSync,
  setSyncError,
  clearSyncError,
  setSyncCount,
  setReauthRequired,
  registerKnownUser,
  setUserSync,
  isBibleTextsServerIdRemapPending,
  clearBibleTextsServerIdRemapPending,
  getPericopeBookVersion,
  setPericopeBookVersion,
  setMasterDataLastSyncedAt,
  getMasterDataLastSyncedAt,
  setMasterDataUpdatedAt,
  getMasterDataUpdatedAt,
} from './storage';
import { getDatabase } from '../db/db';
import {
  loadBundledPericopeSet,
  getBundledPericopeSetVersion,
} from './pericopeSets';
import { FIA_SET_ID } from '../../assets/pericope-sets/pericopeSetVersions';
import {
  persistOrgGrantsFromUserResponse,
  refreshUserOrgGrants,
} from './userOrgGrants';
import { SYNC_PHASE_FIELDS, SYNC_PHASE_LOG_MESSAGE } from './syncPhaseTiming';

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

jest.mock('./connectivity', () => ({
  getConnectivitySnapshot: jest.fn(),
  SERVER_REACHABILITY_FRESH_MS: 5_000,
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
    SYNC_ERROR_USER: 'sync_error_user',
    SYNC_ERROR_MASTER_DATA: 'sync_error_master_data',
    SYNC_ERROR_PROJECTS: 'sync_error_projects',
    SYNC_ERROR_CHAPTER_ASSIGNMENTS: 'sync_error_chapter_assignments',
    SYNC_ERROR_CHAPTER_CLAIMS: 'sync_error_chapter_claims',
    SYNC_ERROR_PROJECT_UNITS: 'sync_error_project_units',
    SYNC_ERROR_BIBLE_TEXTS: 'sync_error_bible_texts',
    SYNC_ERROR_PERICOPES: 'sync_error_pericopes',
    SYNC_ERROR_PREPARE_OFFLINE_BIBLE_TEXTS:
      'sync_error_prepare_offline_bible_texts',
    SYNC_COUNT_PROJECTS: 'sync_count_projects',
    SYNC_COUNT_CHAPTERS: 'sync_count_chapters',
    SYNC_COUNT_BIBLES: 'sync_count_bibles',
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
  getCatalogueQuietSince: jest.fn(() => null),
  setCatalogueQuietSince: jest.fn(),
  clearCatalogueQuietSince: jest.fn(),
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
  registerKnownUser: jest.fn(),
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

jest.mock('./chapterClaimSync', () => ({
  syncPendingChapterClaims: jest.fn().mockResolvedValue({
    synced: 0,
    conflicts: 0,
    failed: 0,
  }),
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

jest.mock('../db/repository', () => ({
  insertMasterData: jest.fn().mockResolvedValue(undefined),
  insertProjects: jest.fn().mockResolvedValue(undefined),
  insertUserProjects: jest.fn().mockResolvedValue(undefined),
  upsertProjectUnits: jest.fn().mockResolvedValue(undefined),
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
  selectExistingIds: jest.fn(
    async (_table: string, ids: number[]) => new Set(ids),
  ),
  userHasLocalProjects: jest.fn().mockResolvedValue(true),
  userHasLocalChapterAssignments: jest.fn().mockResolvedValue(true),
  userNeedsAssigneeRepair: jest.fn().mockResolvedValue(false),
  insertUser: jest.fn().mockResolvedValue(undefined),
  reconcileUserProjects: jest.fn().mockResolvedValue(undefined),
  reconcileUserMilestones: jest.fn().mockResolvedValue(undefined),
  reconcileUserChapterWork: jest.fn().mockResolvedValue(undefined),
  insertPericopeSets: jest.fn().mockResolvedValue(undefined),
  getProjectPericopeSetId: jest.fn().mockResolvedValue(null),
  getChaptersNeedingPericopeSync: jest.fn().mockResolvedValue([]),
  upsertPericopeSet: jest.fn().mockResolvedValue(true),
  getBibleTextAbsencesForBible: jest.fn().mockResolvedValue([]),
  recordBibleTextAbsences: jest.fn().mockResolvedValue(undefined),
  clearBibleTextAbsences: jest.fn().mockResolvedValue(undefined),
}));

const {
  getChaptersToSync,
  getMyWorkChaptersToSync,
  getRecordingLinkedChaptersToSync,
  getLocalProjectIds,
  getChaptersNeedingPericopeSync,
  getProjectPericopeSetId,
  upsertPericopeSet,
  userHasLocalProjects,
  userHasLocalChapterAssignments,
  userNeedsAssigneeRepair,
  insertChapterAssignmentSyncData,
  insertUser,
  insertMasterData,
  insertProjects,
  insertUserProjects,
  upsertProjectUnits,
  selectExistingIds,
} = jest.requireMock('../db/repository') as {
  insertUser: jest.Mock;
  getChaptersToSync: jest.Mock;
  getMyWorkChaptersToSync: jest.Mock;
  getRecordingLinkedChaptersToSync: jest.Mock;
  getLocalProjectIds: jest.Mock;
  getChaptersNeedingPericopeSync: jest.Mock;
  getProjectPericopeSetId: jest.Mock;
  upsertPericopeSet: jest.Mock;
  userHasLocalProjects: jest.Mock;
  userHasLocalChapterAssignments: jest.Mock;
  userNeedsAssigneeRepair: jest.Mock;
  insertChapterAssignmentSyncData: jest.Mock;
  insertMasterData: jest.Mock;
  insertProjects: jest.Mock;
  insertUserProjects: jest.Mock;
  upsertProjectUnits: jest.Mock;
  selectExistingIds: jest.Mock;
};

const { syncPendingChapterClaims } = jest.requireMock('./chapterClaimSync') as {
  syncPendingChapterClaims: jest.Mock;
};

const { syncPendingStageAdvances } = jest.requireMock('./stageAdvanceSync') as {
  syncPendingStageAdvances: jest.Mock;
};

const { reconcileUserProjects, reconcileUserChapterWork } = jest.requireMock(
  '../db/repository',
) as {
  reconcileUserProjects: jest.Mock;
  reconcileUserChapterWork: jest.Mock;
};
describe('syncProjects / syncUserChapterWork reconciliation shape guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('runs project reconciliation with an empty list when the response is validly empty', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });

    await refreshChapterMetadataIfOnline(2);

    expect(reconcileUserProjects).toHaveBeenCalledWith(2, []);
  });

  it('skips project reconciliation when the response shape is malformed', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: 'not-an-array',
    });

    await refreshChapterMetadataIfOnline(2);

    expect(reconcileUserProjects).not.toHaveBeenCalled();
  });

  it('runs project reconciliation with populated ids on a valid response', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [{ id: 5, name: 'Test', target_language_name: 'X' }],
    });

    await refreshChapterMetadataIfOnline(2);

    expect(reconcileUserProjects).toHaveBeenCalledWith(2, [5]);
  });

  it('pushes pending claims before chapter assignment refresh (#611)', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });

    await refreshChapterMetadataIfOnline(2);

    expect(syncPendingChapterClaims).toHaveBeenCalledWith(
      2,
      expect.any(String),
    );
    expect(syncPendingStageAdvances).toHaveBeenCalledWith(
      2,
      expect.any(String),
    );
    const claimsOrder = syncPendingChapterClaims.mock.invocationCallOrder[0];
    const assignmentOrder = (FluentAPI.getChapterAssignments as jest.Mock).mock
      .invocationCallOrder[0];
    const stageOrder = syncPendingStageAdvances.mock.invocationCallOrder[0];
    expect(claimsOrder).toBeLessThan(assignmentOrder);
    expect(assignmentOrder).toBeLessThan(stageOrder);
  });

  it('signals re-auth when stage-advance drain returns AuthError', async () => {
    jest.spyOn(syncEvents, 'emitAuthReauthRequired');
    syncPendingStageAdvances.mockRejectedValueOnce(
      new AuthError('Invalid or revoked session token'),
    );

    await expect(
      syncPendingStageAdvancesForUser(2, 'revoked-token'),
    ).rejects.toThrow(AuthError);

    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(syncEvents.emitAuthReauthRequired).toHaveBeenCalledWith('2');
  });

  it('reports offline stage rows as deferred instead of a clean empty drain (#886)', async () => {
    mockGetConnectivitySnapshot.mockResolvedValueOnce({
      isOnline: false,
      isWifi: false,
      isCellular: false,
      connectionType: 'none',
    });
    mockGetPendingStageAdvances.mockResolvedValueOnce([
      { id: 1, userId: 2 },
      { id: 2, userId: 2 },
      { id: 3, userId: 9 },
    ]);

    await expect(syncPendingStageAdvancesForUser(2, 'token')).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 2,
    });
    expect(syncPendingStageAdvances).not.toHaveBeenCalled();
  });

  it('skips the reachability probe and the drain when no stage advances are pending (#886)', async () => {
    mockGetPendingStageAdvances.mockResolvedValueOnce([{ id: 3, userId: 9 }]);

    await expect(syncPendingStageAdvancesForUser(2, 'token')).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 0,
    });
    expect(mockGetConnectivitySnapshot).not.toHaveBeenCalled();
    expect(syncPendingStageAdvances).not.toHaveBeenCalled();
  });

  it('still probes and drains when the stage-advance count cannot be read (#886)', async () => {
    mockGetPendingStageAdvances.mockRejectedValueOnce(new Error('db closed'));

    await syncPendingStageAdvancesForUser(2, 'token');

    expect(mockGetConnectivitySnapshot).toHaveBeenCalledWith({
      maxAgeMs: expect.any(Number),
    });
    expect(syncPendingStageAdvances).toHaveBeenCalledWith(2, 'token');
  });

  it('skips the reachability probe and the drain when no chapter claims are pending (#886)', async () => {
    mockHasPendingChapterClaimsForUser.mockResolvedValueOnce(false);

    await expect(syncPendingChapterClaimsForUser(2, 'token')).resolves.toEqual({
      synced: 0,
      conflicts: 0,
      failed: 0,
    });
    expect(mockHasPendingChapterClaimsForUser).toHaveBeenCalledWith(2);
    expect(mockGetConnectivitySnapshot).not.toHaveBeenCalled();
    expect(syncPendingChapterClaims).not.toHaveBeenCalled();
    // An online drain of an empty queue used to clear this key through
    // retrySyncStep; the skip must not leave a stale claims error behind.
    expect(clearSyncError).toHaveBeenCalledWith('sync_error_chapter_claims');
  });

  it('still probes and drains claims when the pending check cannot be read (#886)', async () => {
    mockHasPendingChapterClaimsForUser.mockRejectedValueOnce(
      new Error('db closed'),
    );

    await syncPendingChapterClaimsForUser(2, 'token');

    expect(mockGetConnectivitySnapshot).toHaveBeenCalledWith({
      maxAgeMs: expect.any(Number),
    });
    expect(syncPendingChapterClaims).toHaveBeenCalledWith(2, 'token');
  });

  it('assumes deferred work when the offline pending count cannot be read (#886)', async () => {
    mockGetConnectivitySnapshot.mockResolvedValueOnce({
      isOnline: false,
      isWifi: false,
      isCellular: false,
      connectionType: 'none',
    });
    mockGetPendingStageAdvances.mockRejectedValueOnce(new Error('db closed'));

    await expect(syncPendingStageAdvancesForUser(2, 'token')).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 1,
    });
  });

  it('runs chapter-work reconciliation with empty lists when the response is validly empty', async () => {
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [],
      peerCheckChapters: [],
    });

    await refreshChapterMetadataIfOnline(2);

    expect(reconcileUserChapterWork).toHaveBeenCalledWith(2, [], []);
  });

  it('skips chapter-work reconciliation when the response shape is malformed', async () => {
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: null,
      peerCheckChapters: [],
    });

    await refreshChapterMetadataIfOnline(2);

    expect(reconcileUserChapterWork).not.toHaveBeenCalled();
  });

  it('skips chapter-work reconciliation when the response is missing entirely', async () => {
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue(null);

    await refreshChapterMetadataIfOnline(2);

    expect(reconcileUserChapterWork).not.toHaveBeenCalled();
  });
});

const mockGetConnectivitySnapshot =
  getConnectivitySnapshot as jest.MockedFunction<
    typeof getConnectivitySnapshot
  >;

jest.mock('../db/db', () => ({
  getDatabase: jest.fn(() => ({
    execute: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
  })),
}));

const mockGetPendingStageAdvances = jest.fn();
jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: () => mockGetPendingStageAdvances(),
}));

const mockHasPendingChapterClaimsForUser = jest.fn();
const mockGetDatabaseWriteMark = jest.fn();
jest.mock('../db/queries', () => ({
  hasPendingChapterClaimsForUser: (userId: number) =>
    mockHasPendingChapterClaimsForUser(userId),
  getDatabaseWriteMark: () => mockGetDatabaseWriteMark(),
  sameDatabaseWrites: (
    a: { changes: number } | null,
    b: { changes: number } | null,
  ) => a !== null && b !== null && a.changes === b.changes,
}));

// #886: drains skip the reachability probe when their queue is empty.
// Default both queues to "has work" so the existing token/ordering
// assertions on the drain calls keep exercising the drain path; the empty-queue probe skip
// cases below override these per test. Light-refresh freshness is
// per-process state, so clear it before every case.
beforeEach(() => {
  __resetMetadataRefreshFreshnessForTests();
  mockGetDatabaseWriteMark.mockReset().mockResolvedValue(null);
  mockHasPendingChapterClaimsForUser.mockResolvedValue(true);
  mockGetPendingStageAdvances.mockResolvedValue([
    { id: 1, userId: 1 },
    { id: 2, userId: 2 },
    { id: 3, userId: 3 },
  ]);
});

describe('refreshChapterMetadataIfOnline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');

    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    userHasLocalChapterAssignments.mockResolvedValue(true);
    userNeedsAssigneeRepair.mockResolvedValue(false);
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      data: [],
    });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [],
      peerCheckChapters: [],
    });
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    // Defaults so seedFkParents on warm refresh does not fail tests that only
    // assert assignment/claim behavior.
    (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) =>
      Promise.resolve({
        id,
        langName: 'Lang',
        langCodeIso6393: 'eng',
      }),
    );
    (FluentAPI.getBible as jest.Mock).mockImplementation((id: number) =>
      Promise.resolve({
        id,
        languageId: 1,
        name: 'Bible',
        abbreviation: 'BIB',
      }),
    );
    (FluentAPI.getBook as jest.Mock).mockImplementation((id: number) =>
      Promise.resolve({
        id,
        code: 'MAT',
        eng_display_name: 'Matthew',
      }),
    );
    (selectExistingIds as jest.Mock).mockImplementation(
      async (_table: string, ids: number[]) => new Set(ids),
    );
  });

  it('seeds project/assignment language+bible parents by id without catalogue cursors', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) =>
      Promise.resolve({
        id,
        langName: id === 5 ? 'English' : 'Hindi',
        langCodeIso6393: id === 5 ? 'eng' : 'hin',
      }),
    );
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [
        {
          chapterAssignmentId: 11,
          projectUnitId: 22,
          projectId: 1,
          bibleId: 167,
          bookId: 40,
          chapterNumber: 3,
          chapterStatus: 'in_progress',
          totalVerses: 10,
          completedVerses: 2,
        },
      ],
      peerCheckChapters: [],
    });
    (FluentAPI.getBible as jest.Mock).mockResolvedValue({
      id: 167,
      languageId: 5,
      name: 'Bible',
      abbreviation: 'BIB',
    });
    (FluentAPI.getBook as jest.Mock).mockResolvedValue({
      id: 40,
      code: 'MAT',
      eng_display_name: 'Matthew',
    });
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-08-18T07:10:52.908Z',
      data: [],
    });

    await refreshChapterMetadataIfOnline(2);

    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(5, 'valid-token');
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(2336, 'valid-token');
    expect(FluentAPI.getBible).toHaveBeenCalledWith(167, 'valid-token');
    expect(FluentAPI.getLanguages).not.toHaveBeenCalled();
    expect(FluentAPI.getBibles).not.toHaveBeenCalled();
    expect(setMasterDataUpdatedAt).not.toHaveBeenCalled();
    expect(setMasterDataLastSyncedAt).not.toHaveBeenCalled();
    expect(insertMasterData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 5, langCode: 'eng' }),
        expect.objectContaining({ id: 2336, langCode: 'hin' }),
      ]),
      [],
      [],
    );
    expect(insertMasterData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 5, langCode: 'eng' }),
      ]),
      [expect.objectContaining({ id: 40, code: 'MAT' })],
      [expect.objectContaining({ id: 167, languageId: 5 })],
    );
  });

  it('warm refresh continues after language parent 404 and reports incomplete (regression)', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) => {
      if (id === 2336) {
        return Promise.reject(new ApiError(404, 'Language not found'));
      }
      return Promise.resolve({
        id,
        langName: 'English',
        langCodeIso6393: 'eng',
      });
    });
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-08-18T07:10:52.908Z',
      data: [],
    });
    (selectExistingIds as jest.Mock).mockImplementation(
      async (_table: string, ids: number[]) => new Set(ids),
    );

    await refreshChapterMetadataIfOnline(2);

    // Successful parent upserted; failed id preserved locally (not deleted).
    expect(insertMasterData).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 5, langCode: 'eng' })],
      [],
      [],
    );
    expect(insertProjects).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1 }),
    ]);
    // Unaffected warm steps continue (pre-fix: seed throw aborted here).
    expect(FluentAPI.getUserMilestones).toHaveBeenCalledWith(2, 'valid-token');
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalled();
    expect(FluentAPI.getUserChapterAssignments).toHaveBeenCalled();
    expect(setSyncError).toHaveBeenCalledWith(
      'sync_error_projects',
      expect.stringContaining('Incomplete language parent refresh'),
    );
    // Incomplete parent refresh must not latch the assignment cursor.
    expect(setUserLastSyncedAt).not.toHaveBeenCalled();
  });

  it('warm refresh continues after assignment parent 502 and withholds cursor', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [
        {
          chapterAssignmentId: 11,
          projectUnitId: 22,
          projectId: 1,
          bibleId: 167,
          bookId: 40,
          chapterNumber: 3,
          chapterStatus: 'in_progress',
          totalVerses: 10,
          completedVerses: 2,
        },
      ],
      peerCheckChapters: [],
    });
    (FluentAPI.getBible as jest.Mock).mockRejectedValue(
      new ApiError(502, 'Bad Gateway'),
    );
    (FluentAPI.getBook as jest.Mock).mockResolvedValue({
      id: 40,
      code: 'MAT',
      eng_display_name: 'Matthew',
    });
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-08-18T07:10:52.908Z',
      data: [],
    });
    insertChapterAssignmentSyncData.mockResolvedValue({
      insertedCount: 0,
      skipped: [{ chapterAssignmentId: 11, reason: 'missing_bible' }],
    });

    try {
      await refreshChapterMetadataIfOnline(2);

      expect(FluentAPI.getUserMilestones).toHaveBeenCalled();
      expect(insertMasterData).toHaveBeenCalledWith(
        [],
        [expect.objectContaining({ id: 40, code: 'MAT' })],
        [],
      );
      expect(setSyncError).toHaveBeenCalledWith(
        'sync_error_chapter_assignments',
        'Skipped all 1 chapter assignment(s) — missing FK parents',
      );
      expect(setUserLastSyncedAt).not.toHaveBeenCalled();
    } finally {
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [],
      });
    }
  });

  it('warm parent-seed AuthError aborts later steps and marks reauth', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockRejectedValue(
      new AuthError('Invalid or revoked session token'),
    );

    await refreshChapterMetadataIfOnline(2);

    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(FluentAPI.getUserMilestones).not.toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();
    expect(insertProjects).not.toHaveBeenCalled();
    expect(setUserLastSyncedAt).not.toHaveBeenCalled();
  });

  it('warm refresh skips projects missing required local language parents', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) => {
      if (id === 2336) {
        return Promise.reject(new ApiError(404, 'Language not found'));
      }
      return Promise.resolve({
        id,
        langName: 'English',
        langCodeIso6393: 'eng',
      });
    });
    (FluentAPI.getUserMilestones as jest.Mock).mockResolvedValue([
      { id: 22, name: 'Unit', projectId: 1, projectName: 'Alpha' },
      { id: 23, name: 'Keep', projectId: 9, projectName: 'Existing' },
    ]);
    // Languages: only 5 present. Projects: only 9 (existing). Withheld project 1
    // must not upsert its milestone; reconcile still sees full server unit ids.
    (selectExistingIds as jest.Mock).mockImplementation(
      async (table: string, ids: number[]) => {
        if (table === 'languages') return new Set([5]);
        if (table === 'projects') {
          return new Set(ids.filter(id => id === 9));
        }
        return new Set(ids);
      },
    );
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-08-18T07:10:52.908Z',
      data: [],
    });
    getChaptersNeedingPericopeSync.mockResolvedValue([]);
    const { reconcileUserMilestones } = jest.requireMock(
      '../db/repository',
    ) as { reconcileUserMilestones: jest.Mock };

    await refreshChapterMetadataIfOnline(2);

    expect(insertProjects).not.toHaveBeenCalled();
    expect(upsertProjectUnits).toHaveBeenCalledWith([
      { id: 23, projectId: 9, name: 'Keep' },
    ]);
    expect(reconcileUserMilestones).toHaveBeenCalledWith(2, [22, 23]);
    expect(setSyncError).toHaveBeenCalledWith(
      'sync_error_projects',
      expect.stringMatching(
        /Incomplete language parent refresh.*missing language parents/s,
      ),
    );
    expect(setSyncError).toHaveBeenCalledWith(
      'sync_error_project_units',
      expect.stringContaining('missing project parents'),
    );
    expect(getChaptersNeedingPericopeSync).toHaveBeenCalled();
    expect(setUserLastSyncedAt).not.toHaveBeenCalled();
  });

  it('warm catalogue all-FK-invalid continues My Work + pericopes without membership FK', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    (FluentAPI.getUserMilestones as jest.Mock).mockResolvedValue([]);
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
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [
        {
          chapterAssignmentId: 99,
          projectUnitId: 33,
          projectId: 1,
          bibleId: 167,
          bookId: 40,
          chapterNumber: 3,
          chapterStatus: 'in_progress',
          totalVerses: 10,
          completedVerses: 2,
        },
      ],
      peerCheckChapters: [],
    });
    insertChapterAssignmentSyncData
      .mockResolvedValueOnce({
        insertedCount: 0,
        skipped: [{ chapterAssignmentId: 11, reason: 'missing_project_unit' }],
      })
      .mockResolvedValueOnce({
        insertedCount: 1,
        skipped: [],
      });
    (selectExistingIds as jest.Mock).mockImplementation(
      async (table: string, ids: number[]) => {
        if (table === 'projects') return new Set();
        return new Set(ids);
      },
    );
    getChaptersNeedingPericopeSync.mockResolvedValue([]);

    try {
      await refreshChapterMetadataIfOnline(2);

      expect(FluentAPI.getUserChapterAssignments).toHaveBeenCalled();
      expect(insertUserProjects).not.toHaveBeenCalled();
      expect(setSyncError).toHaveBeenCalledWith(
        'sync_error_chapter_assignments',
        'Skipped all 1 chapter assignment(s) — missing FK parents',
      );
      expect(getChaptersNeedingPericopeSync).toHaveBeenCalled();
      expect(setUserLastSyncedAt).not.toHaveBeenCalled();
    } finally {
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [],
      });
    }
  });

  it('warm mixed catalogue batch membership uses only existing project ids', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 5,
          name: 'Local',
          sourceLanguageId: 1,
          targetLanguageId: 1,
        },
      ],
    });
    (FluentAPI.getUserMilestones as jest.Mock).mockResolvedValue([]);
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
    insertChapterAssignmentSyncData.mockResolvedValue({
      insertedCount: 1,
      skipped: [{ chapterAssignmentId: 12, reason: 'missing_project_unit' }],
    });
    (selectExistingIds as jest.Mock).mockImplementation(
      async (table: string, ids: number[]) => {
        if (table === 'projects') {
          return new Set(ids.filter(id => id === 5));
        }
        return new Set(ids);
      },
    );
    getChaptersNeedingPericopeSync.mockResolvedValue([]);

    try {
      await refreshChapterMetadataIfOnline(2);

      expect(insertUserProjects).toHaveBeenCalledWith(2, [5]);
      expect(insertUserProjects).not.toHaveBeenCalledWith(
        2,
        expect.arrayContaining([404]),
      );
      expect(setSyncError).toHaveBeenCalledWith(
        'sync_error_chapter_assignments',
        'Skipped 1 of 2 chapter assignment(s) — missing FK parents',
      );
      expect(getChaptersNeedingPericopeSync).toHaveBeenCalled();
      expect(setUserLastSyncedAt).not.toHaveBeenCalled();

      // Retry with clean parents eventually advances cursor. A partial FK
      // skip must not arm the light-refresh freshness window (#886).
      jest.clearAllMocks();
      (
        jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
      ).mockReturnValue('2026-01-01T00:00:00.000Z');
      mockGetConnectivitySnapshot.mockResolvedValue({
        isOnline: true,
        isWifi: true,
        isCellular: false,
        connectionType: 'wifi',
      });
      (getActiveUserId as jest.Mock).mockReturnValue('2');
      (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
      (getUserLastSyncedAt as jest.Mock).mockReturnValue(
        '2026-06-01T00:00:00.000Z',
      );
      (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
      (FluentAPI.getUserMilestones as jest.Mock).mockResolvedValue([]);
      (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
        syncedAt: '2026-08-19T00:00:00.000Z',
        data: [],
      });
      (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
        assignedChapters: [],
        peerCheckChapters: [],
      });
      (selectExistingIds as jest.Mock).mockImplementation(
        async (_table: string, ids: number[]) => new Set(ids),
      );
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [],
      });
      getChaptersNeedingPericopeSync.mockResolvedValue([]);

      await refreshChapterMetadataIfOnline(2);

      expect(setUserLastSyncedAt).toHaveBeenCalledWith(
        '2',
        '2026-08-19T00:00:00.000Z',
      );
    } finally {
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [],
      });
    }
  });

  it('does not skip a later metadata refresh after the previous one completes', async () => {
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValueOnce({
      syncedAt: '2026-08-18T07:10:52.908Z',
      data: [],
    });
    const realNow = Date.now;
    let clockOffsetMs = 0;
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => realNow() + clockOffsetMs);

    try {
      await refreshChapterMetadataIfOnline(2);
      // Past the light-refresh freshness window (#886).
      clockOffsetMs = METADATA_REFRESH_FRESH_MS + 1;
      await refreshChapterMetadataIfOnline(2);
    } finally {
      nowSpy.mockRestore();
    }

    // Each refresh snapshots once for the gate, once for claims, once for stage advances.
    expect(mockGetConnectivitySnapshot).toHaveBeenCalledTimes(6);
    expect(FluentAPI.getLanguages).not.toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(2);
    expect(FluentAPI.getChapterAssignments).toHaveBeenNthCalledWith(
      1,
      2,
      '2026-06-01T00:00:00.000Z',
      undefined,
      'valid-token',
    );
    expect(FluentAPI.getChapterAssignments).toHaveBeenNthCalledWith(
      2,
      2,
      '2026-06-01T00:00:00.000Z',
      undefined,
      'valid-token',
    );
    expect(setUserLastSyncedAt).toHaveBeenCalledWith(
      '2',
      '2026-08-18T07:10:52.908Z',
    );
  });

  it('sets chapter assignment sync error when user chapter work is fully FK-skipped', async () => {
    jest.useFakeTimers();
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      data: [],
    });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [
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
      peerCheckChapters: [],
    });
    insertChapterAssignmentSyncData.mockResolvedValue({
      insertedCount: 0,
      skipped: [{ chapterAssignmentId: 11, reason: 'missing_bible' }],
    });

    try {
      const pending = refreshChapterMetadataIfOnline(2);
      const expectation = expect(pending).resolves.toBeUndefined();
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1000);
      await expectation;

      expect(setSyncError).toHaveBeenCalledWith(
        'sync_error_chapter_assignments',
        'Skipped all 1 chapter assignment(s) — missing FK parents',
      );
    } finally {
      jest.useRealTimers();
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [],
      });
    }
  });

  it('forwards the pre-await pullRevision from syncUserChapterWork when Complete lands mid-GET', async () => {
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      data: [],
    });
    const pullRevision = getChapterAssignmentPullRevision();
    let resolveUserChapters!: (value: unknown) => void;
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockImplementation(
      () =>
        new Promise(resolve => {
          resolveUserChapters = resolve;
        }),
    );

    const pending = refreshChapterMetadataIfOnline(2);

    await waitFor(() => {
      expect(FluentAPI.getUserChapterAssignments).toHaveBeenCalledWith(
        2,
        'valid-token',
      );
    });

    markChapterCompleteConfirmed(11);
    expect(getChapterAssignmentPullRevision()).toBeGreaterThan(pullRevision);

    resolveUserChapters({
      assignedChapters: [
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
      peerCheckChapters: [
        {
          chapterAssignmentId: 12,
          projectUnitId: 22,
          projectId: 5,
          bibleId: 10,
          bookId: 1,
          chapterNumber: 2,
          chapterStatus: 'peer_check',
          totalVerses: 8,
          completedVerses: 8,
        },
      ],
    });

    await pending;

    expect(insertChapterAssignmentSyncData).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          chapterAssignmentId: 11,
          chapterStatus: 'in_progress',
        }),
        expect.objectContaining({
          chapterAssignmentId: 12,
          chapterStatus: 'peer_check',
        }),
      ],
      pullRevision,
    );
  });

  it('applies partial FK skip warnings after chapter metadata refresh', async () => {
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
          chapterAssignmentId: 99,
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
    insertChapterAssignmentSyncData.mockResolvedValue({
      insertedCount: 1,
      skipped: [{ chapterAssignmentId: 99, reason: 'missing_book' }],
    });

    try {
      await refreshChapterMetadataIfOnline(2);

      expect(setSyncError).toHaveBeenCalledWith(
        'sync_error_chapter_assignments',
        'Skipped 1 of 2 chapter assignment(s) — missing FK parents',
      );
      expect(setUserLastSyncedAt).not.toHaveBeenCalled();
    } finally {
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [],
      });
    }
  });

  it('shares an in-flight metadata refresh for the same user', async () => {
    let releaseAssignments!: () => void;
    (FluentAPI.getChapterAssignments as jest.Mock).mockReturnValueOnce(
      new Promise(resolve => {
        releaseAssignments = () => resolve({ data: [] });
      }),
    );

    const first = refreshChapterMetadataIfOnline(2);
    const second = refreshChapterMetadataIfOnline(2);

    try {
      await waitFor(() => {
        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
      });
      // Initial refresh + syncPendingChapterClaimsForUser (#611) each snapshot.
      expect(
        mockGetConnectivitySnapshot.mock.calls.length,
      ).toBeGreaterThanOrEqual(1);

      releaseAssignments();
      await Promise.all([first, second]);
    } finally {
      releaseAssignments?.();
      await Promise.allSettled([first, second]);
    }
  });

  it('does not call the server when offline', async () => {
    mockGetConnectivitySnapshot.mockResolvedValueOnce({
      isOnline: false,
      isWifi: false,
      isCellular: false,
      connectionType: 'none',
    });

    await refreshChapterMetadataIfOnline(2);

    expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();
    expect(FluentAPI.getUserChapterAssignments).not.toHaveBeenCalled();
  });

  it('emits sync-complete after a refresh that reached the server, not after an offline exit', async () => {
    const emitSpy = jest
      .spyOn(syncEvents, 'emitSyncComplete')
      .mockImplementation(() => {});

    try {
      await refreshChapterMetadataIfOnline(2);
      expect(emitSpy).toHaveBeenCalledTimes(1);

      emitSpy.mockClear();
      // The offline early exit is only reachable once the previous success
      // has aged out of the freshness window (#886).
      __resetMetadataRefreshFreshnessForTests();
      mockGetConnectivitySnapshot.mockResolvedValueOnce({
        isOnline: false,
        isWifi: false,
        isCellular: false,
        connectionType: 'none',
      });
      await refreshChapterMetadataIfOnline(2);
      expect(emitSpy).not.toHaveBeenCalled();
    } finally {
      emitSpy.mockRestore();
    }
  });

  describe('light-refresh freshness (#886)', () => {
    it('skips a repeat refresh inside the freshness window when the catalogue is still quiet', async () => {
      mockHasPendingChapterClaimsForUser.mockResolvedValue(false);
      mockGetPendingStageAdvances.mockResolvedValue([]);
      const emitSpy = jest
        .spyOn(syncEvents, 'emitSyncComplete')
        .mockImplementation(() => {});
      try {
        await refreshChapterMetadataIfOnline(2);
        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
        const probesAfterFirst = mockGetConnectivitySnapshot.mock.calls.length;
        emitSpy.mockClear();
        (getCatalogueQuietSince as jest.Mock).mockReturnValue(Date.now());

        await refreshChapterMetadataIfOnline(2);
        await refreshChapterMetadataIfOnline(2);

        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
        expect(mockGetConnectivitySnapshot).toHaveBeenCalledTimes(
          probesAfterFirst,
        );
        expect(emitSpy).not.toHaveBeenCalled();
      } finally {
        emitSpy.mockRestore();
        (getCatalogueQuietSince as jest.Mock).mockReturnValue(null);
      }
    });

    it('pulls again inside the freshness window when a claim is waiting', async () => {
      mockHasPendingChapterClaimsForUser.mockResolvedValue(false);
      mockGetPendingStageAdvances.mockResolvedValue([]);

      try {
        await refreshChapterMetadataIfOnline(2);
        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);

        (getCatalogueQuietSince as jest.Mock).mockReturnValue(Date.now());
        mockHasPendingChapterClaimsForUser.mockResolvedValue(true);

        await refreshChapterMetadataIfOnline(2);

        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(2);
      } finally {
        (getCatalogueQuietSince as jest.Mock).mockReturnValue(null);
      }
    });

    it('clears an existing quiet stamp when an assignment row is skipped', async () => {
      (getCatalogueQuietSince as jest.Mock).mockReturnValue(
        Date.now() - 60_000,
      );
      mockHasPendingChapterClaimsForUser.mockResolvedValue(true);
      (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
        syncedAt: '2026-02-01T00:00:00.000Z',
        data: [
          {
            chapterAssignmentId: 11,
            projectUnitId: 22,
            projectId: 1,
            bibleId: 167,
            bookId: 40,
            chapterNumber: 3,
            chapterStatus: 'in_progress',
            totalVerses: 10,
            completedVerses: 2,
            updatedAt: '2026-02-01T00:00:00.000Z',
          },
        ],
      });
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [{ chapterAssignmentId: 11, reason: 'missing_book' }],
      });

      try {
        await refreshChapterMetadataIfOnline(2);

        expect(clearCatalogueQuietSince).toHaveBeenCalledWith('2');
        expect(setCatalogueQuietSince).not.toHaveBeenCalled();

        (getCatalogueQuietSince as jest.Mock).mockReturnValue(null);
        await refreshChapterMetadataIfOnline(2);
        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(2);
      } finally {
        insertChapterAssignmentSyncData.mockResolvedValue({
          insertedCount: 1,
          skipped: [],
        });
        (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
          data: [],
        });
        (getCatalogueQuietSince as jest.Mock).mockReturnValue(null);
      }
    });

    it('keeps freshness per user', async () => {
      (getCredentials as jest.Mock).mockImplementation(
        async (userId: string) => ({ token: `user-${userId}-token` }),
      );

      await refreshChapterMetadataIfOnline(2);
      (getActiveUserId as jest.Mock).mockReturnValue('3');
      await refreshChapterMetadataIfOnline(3);

      expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, 'user-2-token');
      expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(3, 'user-3-token');
    });

    it('does not arm the window when the refresh fails, so the next focus retries', async () => {
      (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
        new ApiError(502, 'upstream'),
      );

      await refreshChapterMetadataIfOnline(2);
      await refreshChapterMetadataIfOnline(2);

      // Three attempts per focus. The first failure must not arm freshness,
      // or the second focus would not reach the server.
      expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(6);
      expect(setCatalogueQuietSince).not.toHaveBeenCalled();
      expect(clearCatalogueQuietSince).toHaveBeenCalledWith('2');
    });

    it('does not arm the window when a drain soft-fails, so the next focus retries', async () => {
      syncPendingStageAdvances.mockRejectedValueOnce(new Error('503'));

      await refreshChapterMetadataIfOnline(2);
      await refreshChapterMetadataIfOnline(2);

      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(2);
    });

    it('does not arm the window when stage advances were deferred', async () => {
      mockGetConnectivitySnapshot
        .mockResolvedValueOnce({
          isOnline: true,
          isWifi: true,
          isCellular: false,
          connectionType: 'wifi',
        })
        .mockResolvedValueOnce({
          isOnline: true,
          isWifi: true,
          isCellular: false,
          connectionType: 'wifi',
        })
        .mockResolvedValueOnce({
          isOnline: false,
          isWifi: false,
          isCellular: false,
          connectionType: 'none',
        });

      await refreshChapterMetadataIfOnline(2);
      expect(syncPendingStageAdvances).not.toHaveBeenCalled();

      await refreshChapterMetadataIfOnline(2);
      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(2);
    });

    it('does not arm the window when claims were deferred offline (#886)', async () => {
      mockGetConnectivitySnapshot
        .mockResolvedValueOnce({
          isOnline: true,
          isWifi: true,
          isCellular: false,
          connectionType: 'wifi',
        })
        .mockResolvedValueOnce({
          isOnline: false,
          isWifi: false,
          isCellular: false,
          connectionType: 'none',
        });

      await refreshChapterMetadataIfOnline(2);
      expect(syncPendingChapterClaims).not.toHaveBeenCalled();

      await refreshChapterMetadataIfOnline(2);
      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(2);
    });

    it('does not arm the window when the refresh exits early offline', async () => {
      mockGetConnectivitySnapshot.mockResolvedValueOnce({
        isOnline: false,
        isWifi: false,
        isCellular: false,
        connectionType: 'none',
      });

      await refreshChapterMetadataIfOnline(2);
      expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();

      await refreshChapterMetadataIfOnline(2);
      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
    });

    describe('15-minute catalogue window', () => {
      const quietSince = getCatalogueQuietSince as jest.Mock;

      beforeEach(() => {
        mockHasPendingChapterClaimsForUser.mockResolvedValue(false);
        mockGetPendingStageAdvances.mockResolvedValue([]);
      });

      afterEach(() => {
        quietSince.mockReturnValue(null);
      });

      it('skips the pull inside the window after a clean refresh on this device', async () => {
        quietSince.mockReturnValue(Date.now() - 60_000);

        await refreshChapterMetadataIfOnline(2);

        expect(mockGetConnectivitySnapshot).not.toHaveBeenCalled();
        expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();
        expect(FluentAPI.getUserChapterAssignments).not.toHaveBeenCalled();
        expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
        expect(syncPendingChapterClaims).not.toHaveBeenCalled();
      });

      it('ignores a fresh server cursor when this device never armed the window', async () => {
        (getUserLastSyncedAt as jest.Mock).mockReturnValue(
          new Date().toISOString(),
        );

        await refreshChapterMetadataIfOnline(2);

        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
      });

      it('still pulls inside the window when a claim is waiting', async () => {
        quietSince.mockReturnValue(Date.now());
        mockHasPendingChapterClaimsForUser.mockResolvedValue(true);

        await refreshChapterMetadataIfOnline(2);

        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
      });

      it('pulls once the window has passed', async () => {
        quietSince.mockReturnValue(Date.now() - CATALOGUE_REFRESH_QUIET_MS);

        await refreshChapterMetadataIfOnline(2);

        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
      });

      it('pulls and disarms when the clock moved back past the stamp', async () => {
        quietSince.mockReturnValue(Date.now() + 60_000);

        await refreshChapterMetadataIfOnline(2);

        expect(clearCatalogueQuietSince).toHaveBeenCalledWith('2');
        expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
      });

      it('arms the window only after a clean, complete refresh', async () => {
        await refreshChapterMetadataIfOnline(2);

        expect(setCatalogueQuietSince).toHaveBeenCalledWith(
          '2',
          expect.any(Number),
        );
      });

      it('does not arm the window when the refresh fails', async () => {
        (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
          new ApiError(502, 'upstream'),
        );

        await refreshChapterMetadataIfOnline(2);

        expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();
        expect(setCatalogueQuietSince).not.toHaveBeenCalled();
        expect(clearCatalogueQuietSince).toHaveBeenCalledWith('2');
      });

      it('Sync Now disarms the window for the active account', async () => {
        await syncAllData(true).catch(() => undefined);

        expect(clearCatalogueQuietSince).toHaveBeenCalledWith('2');
      });
    });

    it('a warm refresh with empty claim and stage queues issues exactly one reachability probe', async () => {
      mockHasPendingChapterClaimsForUser.mockResolvedValue(false);
      mockGetPendingStageAdvances.mockResolvedValue([]);

      await refreshChapterMetadataIfOnline(2);

      // Without the empty-queue probe skip this was three: entry gate + claims drain + stage drain.
      expect(mockGetConnectivitySnapshot).toHaveBeenCalledTimes(1);
      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
      expect(syncPendingChapterClaims).not.toHaveBeenCalled();
      expect(syncPendingStageAdvances).not.toHaveBeenCalled();
    });

    it('passes the shared reachability freshness to the entry probe', async () => {
      await refreshChapterMetadataIfOnline(2);

      expect(mockGetConnectivitySnapshot).toHaveBeenNthCalledWith(1, {
        maxAgeMs: expect.any(Number),
      });
    });
  });

  it("passes this user's stored token to sync calls without mutating global authToken", async () => {
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'user-2-specific-token',
    });

    await refreshChapterMetadataIfOnline(2);

    expect(getCredentials).toHaveBeenCalledWith('2');
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(
      2,
      'user-2-specific-token',
    );
    expect(authToken.set).not.toHaveBeenCalled();
  });

  it('retains the captured per-request token after an account switch during metadata refresh (#294)', async () => {
    const initialToken = 'C0294_USER_2_SENTINEL';
    const otherToken = 'C0294_USER_3_SENTINEL';
    let releaseProjects!: (value: { data: [] }) => void;
    (getCredentials as jest.Mock).mockImplementation(
      async (userId: string) => ({
        token: userId === '2' ? initialToken : otherToken,
      }),
    );
    (authToken.get as jest.Mock).mockReturnValue('C0294_GLOBAL_INITIAL');
    (FluentAPI.getUserProjects as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseProjects = resolve;
        }),
    );

    const refresh = refreshChapterMetadataIfOnline(2);
    try {
      await waitFor(() => {
        expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, initialToken);
      });
      expect(FluentAPI.getUserMilestones).not.toHaveBeenCalled();

      // Change only mocks while account2's project request is still pending.
      // Actual account/session/credential stores are never accessed.
      (getActiveUserId as jest.Mock).mockReturnValue('3');
      (authToken.get as jest.Mock).mockReturnValue('C0294_GLOBAL_OTHER');
      releaseProjects({ data: [] });
      await refresh;

      expect(getCredentials).toHaveBeenCalledTimes(1);
      expect(getCredentials).toHaveBeenCalledWith('2');
      // A safe abort after the switch is valid. Any request that does run
      // must retain the original account and its captured token.
      for (const call of (FluentAPI.getUserProjects as jest.Mock).mock.calls) {
        expect(call).toEqual([2, initialToken]);
      }
      for (const call of (FluentAPI.getUserMilestones as jest.Mock).mock
        .calls) {
        expect(call).toEqual([2, initialToken]);
      }
      for (const call of (FluentAPI.getChapterAssignments as jest.Mock).mock
        .calls) {
        expect(call[0]).toBe(2);
        expect(call[3]).toBe(initialToken);
      }
      for (const call of (FluentAPI.getUserChapterAssignments as jest.Mock).mock
        .calls) {
        expect(call).toEqual([2, initialToken]);
      }
      expect(authToken.set).not.toHaveBeenCalled();
      expect(authToken.get).not.toHaveBeenCalled();
    } finally {
      releaseProjects?.({ data: [] });
      await refresh;
    }
  });

  it('marks reauth required and skips the refresh when no credentials exist for this user', async () => {
    (getCredentials as jest.Mock).mockResolvedValue(null);

    await refreshChapterMetadataIfOnline(2);

    expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();
    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(authToken.set).not.toHaveBeenCalled();
  });

  it('skips the refresh without calling the server when userId is not the active user', async () => {
    (getActiveUserId as jest.Mock).mockReturnValue('1');

    await refreshChapterMetadataIfOnline(2);

    expect(getCredentials).not.toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();
    expect(authToken.set).not.toHaveBeenCalled();
  });
});

describe('refreshPrepareOfflineReferencedParents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (FluentAPI.getLanguage as jest.Mock).mockReset();
    (FluentAPI.getBible as jest.Mock).mockReset();
    (FluentAPI.getBook as jest.Mock).mockReset();
  });

  it('repairs parents via by-id GETs without claims, project writes, or watermarks', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockImplementation((id: number) =>
      Promise.resolve({
        id,
        langName: id === 5 ? 'English' : 'Hindi',
        langCodeIso6393: id === 5 ? 'eng' : 'hin',
      }),
    );
    (FluentAPI.getBible as jest.Mock).mockResolvedValue({
      id: 167,
      languageId: 5,
      name: 'Bible',
      abbreviation: 'BIB',
    });
    (FluentAPI.getBook as jest.Mock).mockResolvedValue({
      id: 40,
      code: 'MAT',
      eng_display_name: 'Matthew',
    });

    await expect(
      refreshPrepareOfflineReferencedParents({
        userId: 2,
        projectId: 1,
        chapters: [{ bibleId: 167, bookId: 40 }],
      }),
    ).resolves.toBe('ok');

    expect(syncPendingChapterClaims).not.toHaveBeenCalled();
    expect(insertProjects).not.toHaveBeenCalled();
    expect(reconcileUserProjects).not.toHaveBeenCalled();
    expect(FluentAPI.getLanguages).not.toHaveBeenCalled();
    expect(FluentAPI.getBibles).not.toHaveBeenCalled();
    expect(FluentAPI.getBibleTexts).not.toHaveBeenCalled();
    expect(setMasterDataUpdatedAt).not.toHaveBeenCalled();
    expect(setMasterDataLastSyncedAt).not.toHaveBeenCalled();
    expect(insertMasterData).toHaveBeenCalledTimes(1);
    expect(insertMasterData).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 5, langCode: 'eng' }),
        expect.objectContaining({ id: 2336, langCode: 'hin' }),
      ]),
      [expect.objectContaining({ id: 40, code: 'MAT' })],
      [expect.objectContaining({ id: 167, languageId: 5 })],
    );
  });

  it('skips upsert when active user changes during pending GETs', async () => {
    let releaseGets!: () => void;
    const gate = new Promise<void>(resolve => {
      releaseGets = resolve;
    });
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockImplementation(
      async (id: number) => {
        await gate;
        return {
          id,
          langName: id === 5 ? 'English' : 'Hindi',
          langCodeIso6393: id === 5 ? 'eng' : 'hin',
        };
      },
    );
    (FluentAPI.getBible as jest.Mock).mockImplementation(async () => {
      await gate;
      return {
        id: 167,
        languageId: 5,
        name: 'Bible',
        abbreviation: 'BIB',
      };
    });
    (FluentAPI.getBook as jest.Mock).mockImplementation(async () => {
      await gate;
      return {
        id: 40,
        code: 'MAT',
        eng_display_name: 'Matthew',
      };
    });

    const pending = refreshPrepareOfflineReferencedParents({
      userId: 2,
      projectId: 1,
      chapters: [{ bibleId: 167, bookId: 40 }],
    });

    await waitFor(() => {
      expect(FluentAPI.getLanguage).toHaveBeenCalled();
      expect(FluentAPI.getBook).toHaveBeenCalled();
      expect(FluentAPI.getBible).toHaveBeenCalled();
    });

    (getActiveUserId as jest.Mock).mockReturnValue('99');
    releaseGets();

    await expect(pending).resolves.toBe('skipped');
    expect(insertMasterData).not.toHaveBeenCalled();
  });

  it('logs classified failure only — never forwards Error.message', async () => {
    const warnPayloads: Array<Record<string, unknown>> = [];
    logger.setTransport((level, _tag, _message, context) => {
      if (level === 'warn' && context) {
        warnPayloads.push(context);
      }
    });

    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockRejectedValue(
      new Error('super-secret-token-xyz'),
    );

    await expect(
      refreshPrepareOfflineReferencedParents({
        userId: 2,
        projectId: 1,
        chapters: [{ bibleId: 167, bookId: 40 }],
      }),
    ).resolves.toBe('failed');

    logger.reset();

    expect(insertMasterData).not.toHaveBeenCalled();
    const repairWarn = warnPayloads.find(ctx => ctx.classification === 'error');
    expect(repairWarn).toBeDefined();
    expect(JSON.stringify(repairWarn)).not.toContain('super-secret-token-xyz');
    expect(repairWarn).not.toHaveProperty('error');
    expect(repairWarn).not.toHaveProperty('message');
    expect(repairWarn).not.toHaveProperty('name');
    expect(repairWarn).not.toHaveProperty('code');
    expect(repairWarn).not.toHaveProperty('stack');
    expect(repairWarn).not.toHaveProperty('body');
  });

  it('returns offline without API calls', async () => {
    mockGetConnectivitySnapshot.mockResolvedValueOnce({
      isOnline: false,
      isWifi: false,
      isCellular: false,
      connectionType: 'none',
    });

    await expect(
      refreshPrepareOfflineReferencedParents({
        userId: 2,
        projectId: 1,
        chapters: [{ bibleId: 167, bookId: 40 }],
      }),
    ).resolves.toBe('offline');

    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
    expect(insertMasterData).not.toHaveBeenCalled();
    expect(syncPendingChapterClaims).not.toHaveBeenCalled();
  });

  it('returns failed when parent GET rejects (caller must not latch)', async () => {
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Alpha',
          sourceLanguageId: 5,
          targetLanguageId: 2336,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockRejectedValueOnce(
      new Error('language down'),
    );

    await expect(
      refreshPrepareOfflineReferencedParents({
        userId: 2,
        projectId: 1,
        chapters: [{ bibleId: 167, bookId: 40 }],
      }),
    ).resolves.toBe('failed');

    expect(syncPendingChapterClaims).not.toHaveBeenCalled();
    expect(setMasterDataUpdatedAt).not.toHaveBeenCalled();
  });
});

describe('syncAllData auth handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');
    __resetFullSyncSingleFlightForTests();
    jest.spyOn(syncEvents, 'emitAuthReauthRequired');
    jest.spyOn(syncEvents, 'emitSyncStart').mockImplementation(() => {});
    jest.spyOn(syncEvents, 'emitSyncComplete').mockImplementation(() => {});

    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getKnownUserIds as jest.Mock).mockReturnValue(['2']);
    (getLastSyncedAt as jest.Mock).mockReturnValue('2026-06-01T00:00:00.000Z');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalProjects.mockResolvedValue(true);
    userHasLocalChapterAssignments.mockResolvedValue(true);
    userNeedsAssigneeRepair.mockResolvedValue(false);
    getChaptersToSync.mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetFullSyncSingleFlightForTests();
  });

  it('sets reauth required when incremental sync has no stored token', async () => {
    (getCredentials as jest.Mock).mockResolvedValue(null);

    await expect(syncAllData(true)).rejects.toThrow(
      'No session token. Please sign in again.',
    );

    expect(clearCredentials).not.toHaveBeenCalled();
    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(authToken.set).not.toHaveBeenCalledWith(null);
    expect(syncEvents.emitAuthReauthRequired).toHaveBeenCalledWith('2');
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
  });

  it('sets reauth required when full sync has no stored token after user sync', async () => {
    (getTempCredentials as jest.Mock).mockResolvedValue(null);
    (getCredentials as jest.Mock).mockResolvedValue(null);
    (FluentAPI.getUserByEmail as jest.Mock).mockResolvedValue({
      id: 2,
      email: 'user2@test.com',
    });

    await expect(syncAllData(false, 'user2@test.com')).rejects.toThrow(
      'No session token for synced user.',
    );

    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(syncEvents.emitAuthReauthRequired).toHaveBeenCalledWith('2');
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
  });

  it('sets reauth required for the syncing user when project sync returns 401', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'revoked-token' });
    (getActiveUserId as jest.Mock).mockReturnValue('1');
    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new AuthError('Invalid or revoked session token'),
    );

    await expect(syncAllData(true)).rejects.toThrow(AuthError);

    expect(clearCredentials).not.toHaveBeenCalled();
    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(setReauthRequired).not.toHaveBeenCalledWith('1');
  });

  it('sets reauth required and emits soft reauth when active user project sync returns 401', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'revoked-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new AuthError('Invalid or revoked session token'),
    );

    await expect(syncAllData(true)).rejects.toThrow(AuthError);

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, 'revoked-token');
    expect(clearCredentials).not.toHaveBeenCalled();
    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(authToken.set).not.toHaveBeenCalledWith(null);
    expect(syncEvents.emitAuthReauthRequired).toHaveBeenCalledWith('2');
    expect(setSyncError).toHaveBeenCalledWith(
      'sync_error_projects',
      'Invalid or revoked session token',
    );
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('does not set reauth required when project sync fails with a non-auth error', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new Error('Network timeout'),
    );

    await expect(syncAllData(true)).rejects.toThrow('Network timeout');

    expect(setReauthRequired).not.toHaveBeenCalled();
    expect(syncEvents.emitAuthReauthRequired).not.toHaveBeenCalled();
  });

  it('emits sync complete when incremental sync fails', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'revoked-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new AuthError('Invalid or revoked session token'),
    );

    await expect(syncAllData(true)).rejects.toThrow(AuthError);

    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('forces full assignment sync when local assignments are empty but KV cursor exists', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    userHasLocalChapterAssignments.mockResolvedValue(false);

    await syncAllData(true);

    expect(syncPendingStageAdvances).toHaveBeenCalledWith(2, 'valid-token');
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'valid-token',
    );
  });

  it('registers a new user without switching active user during add-account sync', async () => {
    (getActiveUserId as jest.Mock).mockReturnValue('245');
    (FluentAPI.getUserByEmail as jest.Mock).mockResolvedValue({
      id: 247,
      email: 'b@example.com',
    });
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'b-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue('');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    userHasLocalChapterAssignments.mockResolvedValue(true);

    await syncAllData(false, 'b@example.com');

    expect(registerKnownUser).toHaveBeenCalledWith('247', 'b@example.com');
    expect(setUserSync).not.toHaveBeenCalled();
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(247, 'b-token');
  });

  it('forces full assignment sync for a new user on a shared device despite peer-checker rows', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'new-user-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'new-user-token',
    });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue('');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    userHasLocalChapterAssignments.mockResolvedValue(true);

    await syncAllData(false, 'user2@test.com', preloadedUser);

    expect(FluentAPI.getUserByEmail).not.toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'new-user-token',
    );
  });

  it('forces full assignment sync for a new user on a shared device despite peer-checker rows when user is fetched', async () => {
    (FluentAPI.getUserByEmail as jest.Mock).mockResolvedValue({
      id: 2,
      email: 'user2@test.com',
    });
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'new-user-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'new-user-token',
    });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue('');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    userHasLocalChapterAssignments.mockResolvedValue(true);

    await syncAllData(false, 'user2@test.com');

    expect(FluentAPI.getUserByEmail).toHaveBeenCalledWith(
      'user2@test.com',
      'new-user-token',
    );
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'new-user-token',
    );
  });

  it('stores the server assignment syncedAt as the per-user cursor after syncAllData succeeds', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-06-02T00:00:00.000Z',
      data: [],
    });
    // Capable remote displayMode available — sync must still never call settings (#777).
    (FluentAPI.getSelfSettings as jest.Mock).mockResolvedValue({
      settings: {
        displayMode: 'pericope',
        suppressTooltip: true,
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
      settingsCapabilities: { partialMerge: true, displayMode: true },
    });

    await syncAllData(true);

    // #886: cursor is the server's syncedAt, never the device clock.
    expect(setUserLastSyncedAt).toHaveBeenCalledWith(
      '2',
      '2026-06-02T00:00:00.000Z',
    );
    expect(FluentAPI.getSelfSettings).not.toHaveBeenCalled();
    expect(FluentAPI.putSelfSettings).not.toHaveBeenCalled();
  });

  it('does not advance the per-user assignment cursor when the server omits syncedAt (#886)', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      data: [],
    });

    await syncAllData(true);

    expect(setUserLastSyncedAt).not.toHaveBeenCalled();
  });

  it('continues chapter assignment sync after pending claim soft-fail', async () => {
    jest.useFakeTimers();
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    syncPendingChapterClaims.mockResolvedValue({
      synced: 0,
      conflicts: 0,
      failed: 1,
    });

    try {
      const pending = syncAllData(true);
      const expectation = expect(pending).resolves.toBeUndefined();
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1000);
      await expectation;

      expect(syncPendingChapterClaims).toHaveBeenCalled();
      expect(FluentAPI.getChapterAssignments).toHaveBeenCalled();
      expect(setSyncError).toHaveBeenCalledWith(
        'sync_error_chapter_claims',
        'Failed to sync 1 pending chapter claim(s)',
      );
    } finally {
      jest.useRealTimers();
      syncPendingChapterClaims.mockResolvedValue({
        synced: 0,
        conflicts: 0,
        failed: 0,
      });
    }
  });
});

describe('sync phase timing instrumentation (#764)', () => {
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
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');
    __resetFullSyncSingleFlightForTests();
    transport.mockReset();
    logger.setTransport(transport);
    jest.spyOn(syncEvents, 'emitAuthReauthRequired');
    jest.spyOn(syncEvents, 'emitSyncStart').mockImplementation(() => {});
    jest.spyOn(syncEvents, 'emitSyncComplete').mockImplementation(() => {});

    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getKnownUserIds as jest.Mock).mockReturnValue(['2']);
    (getLastSyncedAt as jest.Mock).mockReturnValue('2026-06-01T00:00:00.000Z');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalProjects.mockResolvedValue(true);
    userHasLocalChapterAssignments.mockResolvedValue(true);
    userNeedsAssigneeRepair.mockResolvedValue(false);
    getChaptersToSync.mockResolvedValue(new Map());
  });

  afterEach(() => {
    logger.reset();
    jest.restoreAllMocks();
    __resetFullSyncSingleFlightForTests();
  });

  it('keeps 401 as auth, emits allowlisted timing, and redacts credentials', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 10;
      return now;
    });
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'revoked-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new AuthError('Invalid or revoked session token'),
    );

    await expect(syncAllData(true)).rejects.toThrow(AuthError);

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(setSyncError).toHaveBeenCalledWith(
      'sync_error_projects',
      'Invalid or revoked session token',
    );

    const phases = timingContexts();
    expect(phases.length).toBeGreaterThan(0);
    expect(
      phases.some(
        entry => entry.phase === 'Project sync.attempt' && entry.attempt === 1,
      ),
    ).toBe(true);
    expect(
      phases.some(
        entry => entry.phase === 'Project sync.total' && entry.attempt === 1,
      ),
    ).toBe(true);
    for (const context of phases) {
      expect(typeof context.elapsedMs).toBe('number');
      expect(
        Object.keys(context).every(key =>
          (SYNC_PHASE_FIELDS as readonly string[]).includes(key),
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(phases)).not.toMatch(
      /revoked-token|user2@|Bearer|Invalid or revoked/i,
    );
  });

  it('does not classify a non-auth failure as auth and still times the step', async () => {
    jest.useFakeTimers();
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new Error('Network timeout'),
    );

    try {
      const pending = syncAllData(true);
      const expectation = expect(pending).rejects.toThrow('Network timeout');
      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1000);
      await expectation;
    } finally {
      jest.useRealTimers();
    }

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(3);
    expect(setReauthRequired).not.toHaveBeenCalled();
    expect(syncEvents.emitAuthReauthRequired).not.toHaveBeenCalled();
    expect(
      timingContexts().filter(entry => entry.phase === 'Project sync.attempt'),
    ).toHaveLength(3);
    expect(
      timingContexts().find(entry => entry.phase === 'Project sync.total')
        ?.attempt,
    ).toBe(3);
  });
});

describe('syncAllUsers auth handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');
    __resetFullSyncSingleFlightForTests();
    jest.spyOn(syncEvents, 'emitAuthReauthRequired');
    jest.spyOn(syncEvents, 'emitSyncStart').mockImplementation(() => {});
    jest.spyOn(syncEvents, 'emitSyncComplete').mockImplementation(() => {});

    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getKnownUserIds as jest.Mock).mockReturnValue(['1', '2']);
    (getLastSyncedAt as jest.Mock).mockReturnValue('2026-06-01T00:00:00.000Z');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    // Read-through default (#886); individual tests override per user.
    (getUserBibleTextSyncedAt as jest.Mock).mockImplementation(
      (userId: string) => (getUserLastSyncedAt as jest.Mock)(userId),
    );
    (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalProjects.mockResolvedValue(true);
    userHasLocalChapterAssignments.mockResolvedValue(true);
    getChaptersToSync.mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetFullSyncSingleFlightForTests();
  });

  it('syncs every known user on the device', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-06-02T00:00:00.000Z',
      data: [],
    });
    // Capable remote displayMode available — sync must still never call settings (#777).
    (FluentAPI.getSelfSettings as jest.Mock).mockResolvedValue({
      settings: {
        displayMode: 'verse',
        suppressTooltip: true,
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
      settingsCapabilities: { partialMerge: true, displayMode: true },
    });

    await syncAllUsers();

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(2);
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(1, 'user-1-token');
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, 'user-2-token');
    expect(FluentAPI.getSelfSettings).not.toHaveBeenCalled();
    expect(FluentAPI.putSelfSettings).not.toHaveBeenCalled();
    expect(authToken.set).not.toHaveBeenCalled();
    expect(setUserLastSyncedAt).toHaveBeenCalledWith(
      '1',
      '2026-06-02T00:00:00.000Z',
    );
    expect(setUserLastSyncedAt).toHaveBeenCalledWith(
      '2',
      '2026-06-02T00:00:00.000Z',
    );
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('sets reauth required when the active user has no stored token', async () => {
    (getCredentials as jest.Mock).mockResolvedValue(null);

    await expect(syncAllUsers()).rejects.toThrow(
      'No session token. Please sign in again.',
    );

    expect(clearCredentials).not.toHaveBeenCalled();
    expect(setReauthRequired).toHaveBeenCalledWith('2');
    expect(authToken.set).not.toHaveBeenCalledWith(null);
    expect(syncEvents.emitAuthReauthRequired).toHaveBeenCalledWith('2');
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('marks non-active users for reauth but continues syncing', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (FluentAPI.getUserProjects as jest.Mock).mockImplementation(
      async (userId: number) => {
        if (userId === 1) {
          throw new AuthError('Invalid or revoked session token');
        }
        return { data: [] };
      },
    );

    await syncAllUsers();

    expect(clearCredentials).not.toHaveBeenCalled();
    expect(setReauthRequired).toHaveBeenCalledWith('1');
    expect(setReauthRequired).not.toHaveBeenCalledWith('2');
    expect(syncEvents.emitAuthReauthRequired).not.toHaveBeenCalled();
    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(2);
    expect(authToken.set).not.toHaveBeenCalled();
  });

  it('drains each account’s pending claims with that account’s own token (#886)', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );

    await syncAllUsers();

    // The claim endpoint assigns to the bearer: user 1's queue must never be
    // posted with the active user's (2) token.
    expect(syncPendingChapterClaims).toHaveBeenCalledWith(1, 'user-1-token');
    expect(syncPendingChapterClaims).toHaveBeenCalledWith(2, 'user-2-token');
  });

  it('marks a non-active account for reauth when its claim drain hits an expired session, without poisoning the active account (#886)', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-stale' } : { token: 'user-2-token' },
    );
    syncPendingChapterClaims.mockImplementation(async (userId: number) => {
      if (userId === 1) {
        throw new AuthError('Invalid or revoked session token');
      }
      return { synced: 0, conflicts: 0, failed: 0 };
    });

    try {
      await syncAllUsers();
    } finally {
      syncPendingChapterClaims.mockReset();
      syncPendingChapterClaims.mockResolvedValue({
        synced: 0,
        conflicts: 0,
        failed: 0,
      });
    }

    expect(setReauthRequired).toHaveBeenCalledWith('1');
    expect(setReauthRequired).not.toHaveBeenCalledWith('2');
    expect(syncEvents.emitAuthReauthRequired).not.toHaveBeenCalled();
    // The active account still completes its own sync.
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, 'user-2-token');
  });

  it('keeps the bible-text cursor when one account needs a full assignment pull', async () => {
    const { getDatabase } = jest.requireMock('../db/db') as {
      getDatabase: jest.Mock;
    };
    getDatabase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
    });
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-06-01T00:00:00.000Z');
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    // User 2 has no local projects, so its assignment pull is unscoped.
    // Verses are already stored, so the text pull must stay on the text cursor.
    userHasLocalProjects.mockImplementation(
      async (userId: number) => userId === 1,
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      data: [
        {
          bookId: 1,
          chapterNumber: 1,
          verses: [{ id: 1001, verseNumber: 1, text: 'In the beginning' }],
        },
      ],
    });

    try {
      await syncAllUsers();

      expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
        2,
        undefined,
        undefined,
        'user-2-token',
      );
      expect(getChaptersToSync).toHaveBeenCalledWith([1, 2]);
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        1,
        [{ bookId: 1, chapterNumber: 1 }],
        overlapped('2026-06-01T00:00:00.000Z'),
      );
    } finally {
      (
        jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
      ).mockReturnValue('2026-01-01T00:00:00.000Z');
      getDatabase.mockReturnValue({
        execute: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
      });
    }
  });

  it('still pulls bible text when an assignment row is skipped for a missing parent', async () => {
    const { getDatabase } = jest.requireMock('../db/db') as {
      getDatabase: jest.Mock;
    };
    getDatabase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
    });
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (getUserBibleTextSyncedAt as jest.Mock).mockImplementation(
      (userId: string) =>
        userId === '1'
          ? '2026-01-01T00:00:00.000Z'
          : '2026-01-02T00:00:00.000Z',
    );
    (FluentAPI.getChapterAssignments as jest.Mock).mockImplementation(
      async (userId: number) => ({
        syncedAt: '2026-02-01T00:00:00.000Z',
        data:
          userId === 1
            ? [
                {
                  chapterAssignmentId: 11,
                  projectUnitId: 22,
                  projectId: 1,
                  bibleId: 167,
                  bookId: 40,
                  chapterNumber: 3,
                  chapterStatus: 'in_progress',
                  totalVerses: 10,
                  completedVerses: 2,
                  updatedAt: '2026-02-01T00:00:00.000Z',
                },
              ]
            : [],
      }),
    );
    insertChapterAssignmentSyncData.mockResolvedValue({
      insertedCount: 1,
      skipped: [{ chapterAssignmentId: 11, reason: 'missing_book' }],
    });
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      syncedAt: '2026-02-02T00:00:00.000Z',
      data: [
        {
          bookId: 1,
          chapterNumber: 1,
          verses: [{ id: 1001, verseNumber: 1, text: 'edited' }],
        },
      ],
    });

    try {
      await syncAllUsers();

      expect(setUserLastSyncedAt).not.toHaveBeenCalledWith(
        '1',
        expect.anything(),
      );
      expect(setUserLastSyncedAt).toHaveBeenCalledWith(
        '2',
        '2026-02-01T00:00:00.000Z',
      );
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        1,
        [{ bookId: 1, chapterNumber: 1 }],
        overlapped('2026-01-01T00:00:00.000Z'),
      );
      expect(setUserBibleTextSyncedAt).toHaveBeenCalledWith(
        '1',
        '2026-02-02T00:00:00.000Z',
      );
    } finally {
      insertChapterAssignmentSyncData.mockResolvedValue({
        insertedCount: 1,
        skipped: [],
      });
      (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
        data: [],
      });
      getDatabase.mockReturnValue({
        execute: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
      });
    }
  });

  it('scopes catalogue bible-text selection to the union of known users', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    getChaptersToSync.mockResolvedValue(new Map());

    await syncAllUsers();

    expect(getChaptersToSync).toHaveBeenCalledWith([1, 2]);
    expect(getChaptersToSync).not.toHaveBeenCalledWith([]);
  });

  it('forces full assignment sync when user has projects but no local assignments', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    userHasLocalChapterAssignments.mockResolvedValue(false);

    await syncAllUsers();

    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      1,
      undefined,
      undefined,
      'user-1-token',
    );
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'user-2-token',
    );
  });

  it('forces full assignment sync when user has no per-user cursor despite local peer-checker rows', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (getUserLastSyncedAt as jest.Mock).mockImplementation((userId: string) =>
      userId === '1' ? '2026-06-01T00:00:00.000Z' : '',
    );
    userHasLocalChapterAssignments.mockResolvedValue(true);

    await syncAllUsers();

    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'user-2-token',
    );
  });

  it('rethrows the active user first non-auth sync failure', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (FluentAPI.getUserProjects as jest.Mock).mockImplementation(
      async (userId: number) => {
        if (userId === 2) {
          throw new Error('Project sync exploded');
        }
        return { data: [] };
      },
    );

    await expect(syncAllUsers()).rejects.toThrow('Project sync exploded');
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('full-fetches bible texts when assigned chapters have zero local verses (#177)', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (getUserLastSyncedAt as jest.Mock).mockImplementation((userId: string) =>
      userId === '1' ? '2026-06-01T00:00:00.000Z' : '2026-05-01T00:00:00.000Z',
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    // Valid payload so the assertion stays on #177 cursor drop; empty full-fetch
    // missing-chapter failure on this path is covered in sync.steps.test.ts
    // ("fails empty full-fetch when #177 drops cursor despite updatedAfter").
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      data: [
        {
          bookId: 1,
          chapterNumber: 1,
          verses: [{ id: 1001, verseNumber: 1, text: 'In the beginning' }],
        },
      ],
    });

    await syncAllUsers();

    // Incremental cursor is dropped when local verse count is 0.
    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      1,
      [{ bookId: 1, chapterNumber: 1 }],
      undefined,
    );
  });

  it('keeps incremental bible-text cursor when local verses already exist', async () => {
    const { getDatabase } = jest.requireMock('../db/db') as {
      getDatabase: jest.Mock;
    };
    getDatabase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
    });
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (getUserLastSyncedAt as jest.Mock).mockImplementation((userId: string) =>
      userId === '1' ? '2026-06-01T00:00:00.000Z' : '2026-05-01T00:00:00.000Z',
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-05-01T00:00:00.000Z');
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

    await syncAllUsers();

    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      1,
      [{ bookId: 1, chapterNumber: 1 }],
      overlapped('2026-05-01T00:00:00.000Z'),
    );
  });

  it('uses the per-user bible-text cursor, not the assignment cursor, for the text pull (#886)', async () => {
    // Edit-between-light-refresh-and-full-sync: the assignment cursor moved to
    // Jan 3 on a light refresh while the last complete text pull was Jan 1.
    // The text request must still ask for edits since Jan 1.
    const { getDatabase } = jest.requireMock('../db/db') as {
      getDatabase: jest.Mock;
    };
    getDatabase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
    });
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-01-03T00:00:00.000Z',
    );
    (getUserBibleTextSyncedAt as jest.Mock).mockImplementation(
      (userId: string) =>
        userId === '1'
          ? '2026-01-01T00:00:00.000Z'
          : '2026-01-02T00:00:00.000Z',
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      syncedAt: '2026-01-04T00:00:00.000Z',
      data: [
        {
          bookId: 1,
          chapterNumber: 1,
          verses: [{ id: 1001, verseNumber: 1, text: 'edited' }],
        },
      ],
    });

    await syncAllUsers();

    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      1,
      [{ bookId: 1, chapterNumber: 1 }],
      overlapped('2026-01-01T00:00:00.000Z'),
    );
    // Text cursor = server syncedAt from the bulk response, for every account
    // the union pull served.
    expect(setUserBibleTextSyncedAt).toHaveBeenCalledWith(
      '1',
      '2026-01-04T00:00:00.000Z',
    );
    expect(setUserBibleTextSyncedAt).toHaveBeenCalledWith(
      '2',
      '2026-01-04T00:00:00.000Z',
    );
  });

  it('ignores a device clock ahead of the server when committing cursors (#886)', async () => {
    const { getDatabase } = jest.requireMock('../db/db') as {
      getDatabase: jest.Mock;
    };
    getDatabase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
    });
    jest.useFakeTimers({ now: new Date('2027-06-01T00:00:00.000Z') });
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-06-02T00:00:00.000Z',
      data: [],
    });
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      syncedAt: '2026-06-02T00:00:01.000Z',
      data: [
        {
          bookId: 1,
          chapterNumber: 1,
          verses: [{ id: 1001, verseNumber: 1, text: 'v' }],
        },
      ],
    });

    try {
      await syncAllUsers();
    } finally {
      jest.useRealTimers();
    }

    for (const call of (setUserLastSyncedAt as jest.Mock).mock.calls) {
      expect(call[1]).toBe('2026-06-02T00:00:00.000Z');
    }
    expect(setUserLastSyncedAt).toHaveBeenCalled();
    for (const call of (setUserBibleTextSyncedAt as jest.Mock).mock.calls) {
      expect(call[1]).toBe('2026-06-02T00:00:01.000Z');
    }
    expect(setUserBibleTextSyncedAt).toHaveBeenCalled();
  });

  it('does not advance the bible-text cursor on an empty incremental response (#886)', async () => {
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-06-01T00:00:00.000Z');
    // The server answers `{ syncedAt, data: [] }` both for "nothing changed"
    // and for a repository error when a cursor is present — never latch it.
    const { getDatabase } = jest.requireMock('../db/db') as {
      getDatabase: jest.Mock;
    };
    getDatabase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
    });
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      syncedAt: '2026-06-02T00:00:01.000Z',
      data: [],
    });

    await syncAllUsers();

    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      1,
      [{ bookId: 1, chapterNumber: 1 }],
      overlapped('2026-06-01T00:00:00.000Z'),
    );
    expect(setUserBibleTextSyncedAt).not.toHaveBeenCalled();
  });

  it('forces a full bible-text pull when any served account has no text cursor (#886)', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (getUserBibleTextSyncedAt as jest.Mock).mockImplementation(
      (userId: string) => (userId === '1' ? '2026-06-01T00:00:00.000Z' : ''),
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      syncedAt: '2026-06-02T00:00:01.000Z',
      data: [
        {
          bookId: 1,
          chapterNumber: 1,
          verses: [{ id: 1001, verseNumber: 1, text: 'v' }],
        },
      ],
    });

    await syncAllUsers();

    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      1,
      [{ bookId: 1, chapterNumber: 1 }],
      undefined,
    );
    expect(setUserBibleTextSyncedAt).toHaveBeenCalledWith(
      '2',
      '2026-06-02T00:00:01.000Z',
    );
  });

  it('does not advance per-user cursors when bible text sync fails', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockRejectedValue(
      new Error('Bible text sync failed'),
    );

    await expect(syncAllUsers()).rejects.toThrow('Bible text sync failed');

    expect(setUserLastSyncedAt).not.toHaveBeenCalled();
    expect(setUserBibleTextSyncedAt).not.toHaveBeenCalled();
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('does not commit a text cursor when one chunk keeps failing after others committed (#886)', async () => {
    jest.useFakeTimers();
    const { getDatabase } = jest.requireMock('../db/db') as {
      getDatabase: jest.Mock;
    };
    getDatabase.mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 12 }] }),
    });
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    getChaptersToSync.mockResolvedValue(
      new Map([
        [1, [{ bookId: 1, chapterNumber: 1 }]],
        [2, [{ bookId: 1, chapterNumber: 1 }]],
      ]),
    );
    // Bible 1 always succeeds (and is written); bible 2 always fails.
    (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
      async (bibleId: number) => {
        if (bibleId === 2) throw new Error('bible 2 chunk failed');
        return {
          syncedAt: '2026-06-02T00:00:01.000Z',
          data: [
            {
              bookId: 1,
              chapterNumber: 1,
              verses: [{ id: 1001, verseNumber: 1, text: 'v' }],
            },
          ],
        };
      },
    );

    const pending = syncAllUsers();
    pending.catch(() => undefined);
    await jest.runAllTimersAsync();
    jest.useRealTimers();
    await expect(pending).rejects.toThrow('bible 2 chunk failed');

    // Coverage is only complete when every chunk committed in one attempt.
    expect(setUserBibleTextSyncedAt).not.toHaveBeenCalled();
  });

  it('starts pending claim sync without waiting for master data', async () => {
    let resolveLanguages: (value: unknown) => void = () => undefined;
    (FluentAPI.getLanguages as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveLanguages = resolve;
        }),
    );
    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getKnownUserIds as jest.Mock).mockReturnValue(['2']);
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'user-2-token' });

    const pending = syncAllUsers();

    await waitFor(() => {
      expect(syncPendingChapterClaims).toHaveBeenCalledWith(
        2,
        expect.any(String),
      );
    });
    expect(syncPendingStageAdvances).not.toHaveBeenCalled();
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();

    resolveLanguages([]);
    await pending;

    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, 'user-2-token');
    expect(syncPendingStageAdvances).toHaveBeenCalledWith(2, 'user-2-token');
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('enforces single-flight across overlapping syncAllUsers calls', async () => {
    let resolveProjects: (value: unknown) => void = () => undefined;
    (getKnownUserIds as jest.Mock).mockReturnValue(['2']);
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'user-2-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveProjects = resolve;
        }),
    );

    const first = syncAllUsers();
    await waitFor(() => {
      expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    });

    const second = syncAllUsers();
    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);

    resolveProjects({ data: [] });
    await Promise.all([first, second]);

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    expect(syncEvents.emitSyncStart).toHaveBeenCalledTimes(1);
    expect(syncEvents.emitSyncComplete).toHaveBeenCalledTimes(1);
  });

  it('joins syncAllData into an in-flight syncAllUsers pass', async () => {
    let resolveProjects: (value: unknown) => void = () => undefined;
    (getKnownUserIds as jest.Mock).mockReturnValue(['2']);
    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'user-2-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveProjects = resolve;
        }),
    );

    const usersPass = syncAllUsers();
    await waitFor(() => {
      expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    });

    const dataPass = syncAllData(true);
    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);

    resolveProjects({ data: [] });
    await Promise.all([usersPass, dataPass]);

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    expect(syncEvents.emitSyncStart).toHaveBeenCalledTimes(1);
  });

  it('runs a login/add-account syncAllData after an in-flight syncAllUsers instead of joining it', async () => {
    let resolveProjects: (value: unknown) => void = () => undefined;
    const newUser = { id: 3, email: 'new@example.com' };
    (getKnownUserIds as jest.Mock).mockReturnValue(['2']);
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'user-3-token',
    });
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '3' ? { token: 'user-3-token' } : { token: 'user-2-token' },
    );
    (FluentAPI.getUserProjects as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveProjects = resolve;
        }),
    );

    const usersPass = syncAllUsers();
    await waitFor(() => {
      expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    });
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, 'user-2-token');

    const loginPass = syncAllData(false, newUser.email, newUser);

    // Login must wait for the in-flight pass, not run concurrently or be dropped.
    await Promise.resolve();
    expect(insertUser).not.toHaveBeenCalled();
    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);

    resolveProjects({ data: [] });
    await Promise.all([usersPass, loginPass]);

    expect(insertUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, email: newUser.email }),
    );
    expect(registerKnownUser).toHaveBeenCalledWith('3', newUser.email);
    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(2);
    expect(FluentAPI.getUserProjects).toHaveBeenLastCalledWith(
      3,
      'user-3-token',
    );
  });

  it('still runs the next full sync after the in-flight pass fails', async () => {
    let rejectProjects: (reason: unknown) => void = () => undefined;
    (getKnownUserIds as jest.Mock).mockReturnValue(['2']);
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'user-2-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectProjects = reject;
        }),
    );

    const usersPass = syncAllUsers();
    await waitFor(() => {
      expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    });
    const loginPass = syncAllData(false, 'new@example.com', {
      id: 3,
      email: 'new@example.com',
    });
    const usersResult = usersPass.catch((error: unknown) => error);

    rejectProjects(new Error('boom'));
    await usersResult;
    await loginPass;

    expect(insertUser).toHaveBeenCalled();
  });
});

describe('syncAllData progressive login (#670 / #679)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');
    __resetFullSyncSingleFlightForTests();
    jest.spyOn(syncEvents, 'emitAuthReauthRequired');
    jest.spyOn(syncEvents, 'emitSyncStart').mockImplementation(() => {});
    jest.spyOn(syncEvents, 'emitSyncComplete').mockImplementation(() => {});

    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getLastSyncedAt as jest.Mock).mockReturnValue('');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue('');
    (getUserLastSyncedAt as jest.Mock).mockReturnValue('');
    (getUserBibleTextSyncedAt as jest.Mock).mockImplementation(
      (userId: string) => (getUserLastSyncedAt as jest.Mock)(userId),
    );
    (getMasterDataLastSyncedAt as jest.Mock).mockReturnValue('');
    (getMasterDataUpdatedAt as jest.Mock).mockReturnValue('');
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getLanguage as jest.Mock).mockImplementation(
      async (id: number) => ({
        id,
        langName: `Language ${id}`,
        langCodeIso6393: `l${id}`,
      }),
    );
    (FluentAPI.getBooks as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getBook as jest.Mock).mockImplementation(async (id: number) => ({
      id,
      code: `B${id}`,
      eng_display_name: `Book ${id}`,
    }));
    (FluentAPI.getBibles as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getBible as jest.Mock).mockImplementation(
      async (id: number) => ({
        id,
        languageId: 3,
        name: `Bible ${id}`,
        abbreviation: `B${id}`,
      }),
    );
    // Echo requested chapters so full-fetch no longer looks like "all missing".
    (FluentAPI.getBibleTexts as jest.Mock).mockImplementation(
      async (
        _bibleId: number,
        chapters: Array<{ bookId: number; chapterNumber: number }>,
      ) => ({
        data: chapters.map(chapter => ({
          bookId: chapter.bookId,
          chapterNumber: chapter.chapterNumber,
          verses: [
            {
              id: chapter.bookId * 100 + chapter.chapterNumber,
              verseNumber: 1,
              text: 'verse',
            },
          ],
        })),
      }),
    );
    userHasLocalProjects.mockResolvedValue(false);
    userHasLocalChapterAssignments.mockResolvedValue(false);
    userNeedsAssigneeRepair.mockResolvedValue(false);
    getLocalProjectIds.mockResolvedValue([]);
    getChaptersToSync.mockResolvedValue(
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
    getMyWorkChaptersToSync.mockResolvedValue(
      new Map([[10, [{ bookId: 41, chapterNumber: 1 }]]]),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetFullSyncSingleFlightForTests();
  });

  it('unblocks Tier 1 before full project assignments and scopes bible texts to My Work', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'new-user-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'new-user-token',
    });

    // Fresh install: Tier 1 only has My Work (MRK); Tier 2 catalogue adds PSA.
    // Unbundled set id so GET /pericope-sets/{id} is the persist path.
    const myWorkChapter = {
      projectId: 10,
      bookId: 41,
      bookCode: 'MRK',
      chapterNumber: 1,
    };
    const catalogueChapter = {
      projectId: 10,
      bookId: 19,
      bookCode: 'PSA',
      chapterNumber: 1,
    };
    getProjectPericopeSetId.mockResolvedValue(99);
    getChaptersNeedingPericopeSync
      .mockResolvedValueOnce([myWorkChapter])
      .mockResolvedValueOnce([catalogueChapter]);
    (FluentAPI.getPericopeSet as jest.Mock).mockImplementation(
      async (_setId: number, opts: { bookCode: string }) => ({
        status: 200,
        etag: `"etag-${opts.bookCode}"`,
        data: [
          {
            bookCode: opts.bookCode,
            pericopeNumber: '1',
            pericopeTitle: null,
            verses: [{ chapterNumber: 1, verseNumber: 1 }],
          },
        ],
      }),
    );

    let resolveAssignments: (value: unknown) => void = () => undefined;
    (FluentAPI.getChapterAssignments as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveAssignments = resolve;
        }),
    );

    const onTier1Complete = jest.fn();
    const pending = syncAllData(false, preloadedUser.email, preloadedUser, {
      onTier1Complete,
    });

    await waitFor(() => {
      expect(FluentAPI.getUserChapterAssignments).toHaveBeenCalledWith(
        2,
        'new-user-token',
      );
      expect(getMyWorkChaptersToSync).toHaveBeenCalledWith(2);
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 41, chapterNumber: 1 }],
        undefined,
      );
      expect(onTier1Complete).toHaveBeenCalledTimes(1);
    });

    // Tier 1 unblocked: My Work pericopes persisted; catalogue PSA not yet.
    expect(FluentAPI.getPericopeSet).toHaveBeenCalledWith(
      99,
      {
        bookCode: 'MRK',
        etag: null,
      },
      undefined,
    );
    expect(upsertPericopeSet).toHaveBeenCalledWith(
      99,
      'MRK',
      expect.arrayContaining([
        expect.objectContaining({ chapterNumber: 1, verseNumber: 1 }),
      ]),
    );
    expect(FluentAPI.getPericopeSet).not.toHaveBeenCalledWith(
      99,
      expect.objectContaining({ bookCode: 'PSA' }),
    );
    expect(upsertPericopeSet).not.toHaveBeenCalledWith(
      99,
      'PSA',
      expect.anything(),
    );

    // Tier 2 not finished yet — full catalogue still pending.
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
    // Tier 1 only fetched My Work texts so far.
    expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(1);
    resolveAssignments({ data: [] });
    await pending;

    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'new-user-token',
    );
    expect(onTier1Complete).toHaveBeenCalledTimes(1);
    // After Tier 2 assignments, catalogue PSA pericopes are fetched + persisted.
    expect(FluentAPI.getPericopeSet).toHaveBeenCalledWith(
      99,
      {
        bookCode: 'PSA',
        etag: null,
      },
      undefined,
    );
    expect(upsertPericopeSet).toHaveBeenCalledWith(
      99,
      'PSA',
      expect.arrayContaining([
        expect.objectContaining({ chapterNumber: 1, verseNumber: 1 }),
      ]),
    );
    // Tier 2 texts skip My Work (MRK) and only fetch remaining catalogue (PSA).
    expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(2);
    expect(FluentAPI.getBibleTexts).toHaveBeenLastCalledWith(
      10,
      [{ bookId: 19, chapterNumber: 1 }],
      undefined,
    );
  });

  it('re-login unblocks My Work before full catalogue when there is no cursor', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'relogin-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'relogin-token',
    });
    // Local projects exist ⇒ re-login path (not fresh install).
    getLocalProjectIds.mockResolvedValue([10]);
    (getUserLastSyncedAt as jest.Mock).mockReturnValue('');

    const myWorkChapter = {
      projectId: 10,
      bookId: 41,
      bookCode: 'MRK',
      chapterNumber: 1,
    };
    const catalogueChapter = {
      projectId: 10,
      bookId: 19,
      bookCode: 'PSA',
      chapterNumber: 1,
    };
    getProjectPericopeSetId.mockResolvedValue(99);
    getChaptersNeedingPericopeSync
      .mockResolvedValueOnce([myWorkChapter])
      .mockResolvedValueOnce([catalogueChapter]);
    (FluentAPI.getPericopeSet as jest.Mock).mockImplementation(
      async (_setId: number, opts: { bookCode: string }) => ({
        status: 200,
        etag: `"etag-${opts.bookCode}"`,
        data: [
          {
            bookCode: opts.bookCode,
            pericopeNumber: '1',
            pericopeTitle: null,
            verses: [{ chapterNumber: 1, verseNumber: 1 }],
          },
        ],
      }),
    );

    let resolveCatalogue: (value: unknown) => void = () => undefined;
    (FluentAPI.getChapterAssignments as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveCatalogue = resolve;
        }),
    );

    const onTier1Complete = jest.fn();
    const pending = syncAllData(false, preloadedUser.email, preloadedUser, {
      onTier1Complete,
    });

    await waitFor(() => {
      expect(FluentAPI.getUserChapterAssignments).toHaveBeenCalledWith(
        2,
        'relogin-token',
      );
      expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
        10,
        [{ bookId: 41, chapterNumber: 1 }],
        undefined,
      );
      expect(onTier1Complete).toHaveBeenCalledTimes(1);
    });

    // Catalogue must not have finished before Tier 1 unblocked Home.
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledTimes(1);
    expect(FluentAPI.getPericopeSet).toHaveBeenCalledWith(
      99,
      {
        bookCode: 'MRK',
        etag: null,
      },
      undefined,
    );
    expect(FluentAPI.getPericopeSet).not.toHaveBeenCalledWith(
      99,
      expect.objectContaining({ bookCode: 'PSA' }),
    );

    resolveCatalogue({ data: [] });
    await pending;

    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'relogin-token',
    );
    expect(FluentAPI.getPericopeSet).toHaveBeenCalledWith(
      99,
      {
        bookCode: 'PSA',
        etag: null,
      },
      undefined,
    );
    expect(FluentAPI.getBibleTexts).toHaveBeenLastCalledWith(
      10,
      [{ bookId: 19, chapterNumber: 1 }],
      undefined,
    );
  });

  it('My-Work-only login preserves bible count and clears remap without Tier 1 refetch', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'mywork-only-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'mywork-only-token',
    });
    // Multi-account device: remap pass must union known users, not just
    // eligibleUserIds:[2] from syncAllData.
    (getKnownUserIds as jest.Mock).mockReturnValue(['1', '2']);
    // Assignments are only My Work — Tier 2 exclude empties the remainder.
    getChaptersToSync.mockResolvedValue(
      new Map([[10, [{ bookId: 41, chapterNumber: 1 }]]]),
    );
    getMyWorkChaptersToSync.mockResolvedValue(
      new Map([[10, [{ bookId: 41, chapterNumber: 1 }]]]),
    );
    getRecordingLinkedChaptersToSync.mockResolvedValue(new Map());
    (isBibleTextsServerIdRemapPending as jest.Mock).mockReturnValue(true);
    // Local texts from Tier 1 (distinct bible count) must survive Tier 2.
    (getDatabase as jest.Mock).mockReturnValue({
      execute: jest.fn().mockResolvedValue({ rows: [{ count: 2 }] }),
    });
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({
      data: [
        {
          bookId: 41,
          chapterNumber: 1,
          verses: [{ id: 4101, verseNumber: 1, text: 'The beginning' }],
        },
      ],
    });
    getProjectPericopeSetId.mockResolvedValue(null);
    getChaptersNeedingPericopeSync.mockResolvedValue([]);
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      data: [],
    });

    await syncAllData(false, preloadedUser.email, preloadedUser, {
      onTier1Complete: jest.fn(),
    });

    // Remap pending: catalogue selection uses known-user union so clearing
    // remap does not leave other accounts' chapters unmapped.
    expect(getChaptersToSync).toHaveBeenCalledWith([1, 2]);

    expect(FluentAPI.getBibleTexts).toHaveBeenCalledTimes(1);
    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      10,
      [{ bookId: 41, chapterNumber: 1 }],
      undefined,
    );
    expect(setSyncCount).toHaveBeenCalledWith('sync_count_bibles', 2);
    expect(setSyncCount).not.toHaveBeenCalledWith('sync_count_bibles', 0);
    expect(clearBibleTextsServerIdRemapPending).toHaveBeenCalled();
    (isBibleTextsServerIdRemapPending as jest.Mock).mockReturnValue(false);
  });

  it('cold login Tier 1 seeds FK parents and unblocks before full catalogue (#679)', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'scoped-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'scoped-token',
    });
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Alpha',
          sourceLanguageId: 1,
          targetLanguageId: 2,
        },
      ],
    });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [
        {
          chapterAssignmentId: 100,
          projectId: 10,
          projectUnitId: 20,
          bibleId: 55,
          bookId: 41,
          chapterNumber: 1,
        },
      ],
      peerCheckChapters: [],
    });

    // Hold the full list catalogue so Tier 1 can assert it is still unresolved.
    let resolveLanguages: (value: unknown) => void = () => undefined;
    (FluentAPI.getLanguages as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveLanguages = resolve;
        }),
    );

    const onTier1Complete = jest.fn();
    const pending = syncAllData(false, preloadedUser.email, preloadedUser, {
      onTier1Complete,
    });

    await waitFor(() => {
      expect(onTier1Complete).toHaveBeenCalledTimes(1);
    });

    // Scoped seeds used explicit session token; full catalogue still unresolved.
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(1, 'scoped-token');
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(2, 'scoped-token');
    expect(FluentAPI.getBible).toHaveBeenCalledWith(55, 'scoped-token');
    expect(FluentAPI.getBook).toHaveBeenCalledWith(41, 'scoped-token');
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(3, 'scoped-token');
    expect(setMasterDataLastSyncedAt).not.toHaveBeenCalled();
    expect(setMasterDataUpdatedAt).not.toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();

    resolveLanguages([]);
    await pending;

    expect(FluentAPI.getLanguages).toHaveBeenCalledWith(
      undefined,
      'scoped-token',
    );
    expect(setMasterDataUpdatedAt).toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'scoped-token',
    );
    const masterCursorOrder = (setMasterDataUpdatedAt as jest.Mock).mock
      .invocationCallOrder[0];
    const catalogueOrder = (FluentAPI.getChapterAssignments as jest.Mock).mock
      .invocationCallOrder[0];
    expect(masterCursorOrder).toBeLessThan(catalogueOrder);
  });

  it('re-login Tier 1 seeds assignment parents without advancing master cursor (#679)', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'relogin-scoped',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'relogin-scoped',
    });
    getLocalProjectIds.mockResolvedValue([10]);
    (getUserLastSyncedAt as jest.Mock).mockReturnValue('');
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Alpha',
          sourceLanguageId: 7,
          targetLanguageId: 7,
        },
      ],
    });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [
        {
          chapterAssignmentId: 101,
          projectId: 10,
          projectUnitId: 21,
          bibleId: 9,
          bookId: 41,
          chapterNumber: 1,
        },
        {
          chapterAssignmentId: 102,
          projectId: 10,
          projectUnitId: 22,
          bibleId: 9,
          bookId: 41,
          chapterNumber: 2,
        },
      ],
      peerCheckChapters: [],
    });

    let resolveLanguages: (value: unknown) => void = () => undefined;
    (FluentAPI.getLanguages as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveLanguages = resolve;
        }),
    );

    const onTier1Complete = jest.fn();
    const pending = syncAllData(false, preloadedUser.email, preloadedUser, {
      onTier1Complete,
    });

    await waitFor(() => {
      expect(onTier1Complete).toHaveBeenCalledTimes(1);
    });

    // Dedup: one language seed for shared source/target; one bible/book pair.
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(7, 'relogin-scoped');
    expect(
      (FluentAPI.getLanguage as jest.Mock).mock.calls.filter(
        ([id]: [number]) => id === 7,
      ),
    ).toHaveLength(1);
    expect(FluentAPI.getBible).toHaveBeenCalledTimes(1);
    expect(FluentAPI.getBible).toHaveBeenCalledWith(9, 'relogin-scoped');
    expect(FluentAPI.getBook).toHaveBeenCalledTimes(1);
    expect(FluentAPI.getBook).toHaveBeenCalledWith(41, 'relogin-scoped');
    // Seed inserts must not advance the global master cursor.
    expect(
      insertMasterData.mock.invocationCallOrder.length,
    ).toBeGreaterThanOrEqual(2);
    expect(setMasterDataUpdatedAt).not.toHaveBeenCalled();
    expect(setMasterDataLastSyncedAt).not.toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).not.toHaveBeenCalled();

    resolveLanguages([]);
    await pending;

    expect(setMasterDataUpdatedAt).toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
      'relogin-scoped',
    );
  });

  it('empty My Work skips assignment seed and still completes Tier 1 (#679)', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'empty-work-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'empty-work-token',
    });
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Alpha',
          sourceLanguageId: 1,
          targetLanguageId: 2,
        },
      ],
    });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [],
      peerCheckChapters: [],
    });
    getMyWorkChaptersToSync.mockResolvedValue(new Map());

    const onTier1Complete = jest.fn();
    await syncAllData(false, preloadedUser.email, preloadedUser, {
      onTier1Complete,
    });

    expect(onTier1Complete).toHaveBeenCalledTimes(1);
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(1, 'empty-work-token');
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(2, 'empty-work-token');
    expect(FluentAPI.getBible).not.toHaveBeenCalled();
    expect(FluentAPI.getBook).not.toHaveBeenCalled();
    expect(insertChapterAssignmentSyncData).not.toHaveBeenCalled();
  });

  it('seed failure does not fake Tier 1 success (#679)', async () => {
    jest.useFakeTimers();
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'seed-fail-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'seed-fail-token',
    });
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Alpha',
          sourceLanguageId: 1,
          targetLanguageId: 2,
        },
      ],
    });
    (FluentAPI.getLanguage as jest.Mock).mockRejectedValue(
      new Error('language seed unavailable'),
    );

    try {
      const onTier1Complete = jest.fn();
      const pending = syncAllData(false, preloadedUser.email, preloadedUser, {
        onTier1Complete,
      });
      const expectation = expect(pending).rejects.toThrow(
        'language seed unavailable',
      );

      await jest.advanceTimersByTimeAsync(500);
      await jest.advanceTimersByTimeAsync(1000);
      await expectation;

      // Error path may clear the Home spinner, but must not claim master/work success.
      expect(FluentAPI.getUserChapterAssignments).not.toHaveBeenCalled();
      expect(setMasterDataUpdatedAt).not.toHaveBeenCalled();
      expect(setMasterDataLastSyncedAt).not.toHaveBeenCalled();
      expect(setUserLastSyncedAt).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('warm incremental still uses master cursor and does not by-id seed (#679)', async () => {
    const cursor = '2026-06-01T00:00:00.000Z';
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'warm-token',
    });
    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getMasterDataUpdatedAt as jest.Mock).mockReturnValue(cursor);
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Alpha',
          sourceLanguageId: 1,
          targetLanguageId: 2,
        },
      ],
    });
    userHasLocalChapterAssignments.mockResolvedValue(true);

    await syncAllData(true);

    expect(FluentAPI.getLanguages).toHaveBeenCalledWith(cursor, 'warm-token');
    expect(FluentAPI.getBooks).toHaveBeenCalledWith(cursor, 'warm-token');
    expect(FluentAPI.getBibles).toHaveBeenCalledWith(cursor, 'warm-token');
    expect(FluentAPI.getLanguage).not.toHaveBeenCalled();
    expect(FluentAPI.getBook).not.toHaveBeenCalled();
    expect(FluentAPI.getBible).not.toHaveBeenCalled();
    expect(setMasterDataUpdatedAt).toHaveBeenCalled();
  });

  it('incremental Sync Now starts master while pending claims are unresolved (#679)', async () => {
    const cursor = '2026-06-01T00:00:00.000Z';
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'parallel-warm-token',
    });
    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getMasterDataLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getMasterDataUpdatedAt as jest.Mock).mockReturnValue(cursor);
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalChapterAssignments.mockResolvedValue(true);

    let resolveClaims: (value: unknown) => void = () => undefined;
    let resolveLanguages: (value: unknown) => void = () => undefined;
    syncPendingChapterClaims.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveClaims = resolve;
        }),
    );
    (FluentAPI.getLanguages as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveLanguages = resolve;
        }),
    );

    const pending = syncAllData(true);

    await waitFor(() => {
      expect(syncPendingChapterClaims).toHaveBeenCalledWith(
        2,
        expect.any(String),
      );
      expect(FluentAPI.getLanguages).toHaveBeenCalledWith(
        cursor,
        'parallel-warm-token',
      );
    });
    // Projects must wait until both claims and master finish.
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();

    resolveClaims({ synced: 0, conflicts: 0, failed: 0 });
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();

    resolveLanguages([]);
    await pending;

    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(
      2,
      'parallel-warm-token',
    );
    const claimsOrder = syncPendingChapterClaims.mock.invocationCallOrder[0];
    const masterOrder = (FluentAPI.getLanguages as jest.Mock).mock
      .invocationCallOrder[0];
    const projectsOrder = (FluentAPI.getUserProjects as jest.Mock).mock
      .invocationCallOrder[0];
    expect(claimsOrder).toBeLessThan(projectsOrder);
    expect(masterOrder).toBeLessThan(projectsOrder);
  });

  it('peer-check-only My Work seeds FK parents with session token and leaves master cursor (#679)', async () => {
    const preloadedUser = { id: 2, email: 'user2@test.com' };
    const peerToken = 'peer-check-only-token';
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: peerToken,
    });
    (getCredentials as jest.Mock).mockResolvedValue({
      token: peerToken,
    });
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Alpha',
          sourceLanguageId: 4,
          targetLanguageId: 5,
        },
      ],
    });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [],
      peerCheckChapters: [
        {
          chapterAssignmentId: 200,
          projectId: 10,
          projectUnitId: 30,
          bibleId: 88,
          bookId: 40,
          chapterNumber: 3,
        },
      ],
    });
    (FluentAPI.getBible as jest.Mock).mockImplementation(
      async (id: number) => ({
        id,
        languageId: 6,
        name: `Bible ${id}`,
        abbreviation: `B${id}`,
      }),
    );

    let resolveLanguages: (value: unknown) => void = () => undefined;
    (FluentAPI.getLanguages as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveLanguages = resolve;
        }),
    );

    const onTier1Complete = jest.fn();
    const pending = syncAllData(false, preloadedUser.email, preloadedUser, {
      onTier1Complete,
    });

    await waitFor(() => {
      expect(onTier1Complete).toHaveBeenCalledTimes(1);
    });

    expect(FluentAPI.getUserChapterAssignments).toHaveBeenCalledWith(
      2,
      peerToken,
    );
    expect(FluentAPI.getBible).toHaveBeenCalledWith(88, peerToken);
    expect(FluentAPI.getBook).toHaveBeenCalledWith(40, peerToken);
    expect(FluentAPI.getLanguage).toHaveBeenCalledWith(6, peerToken);
    expect(setMasterDataUpdatedAt).not.toHaveBeenCalled();
    expect(setMasterDataLastSyncedAt).not.toHaveBeenCalled();

    resolveLanguages([]);
    await pending;

    expect(setMasterDataUpdatedAt).toHaveBeenCalled();
  });
});

describe('sync public API', () => {
  it('does not export a misleading switchUser stub', () => {
    expect(sync).not.toHaveProperty('switchUser');
  });
});

/**
 * Metadata refresh must hydrate pericopes for newly imported chapters
 * (warm All-synced sessions have no Sync Now). Uses the real FIA (#447)
 * bundled loader for set id 2 / 1PE — not a disconnected syncPericopes spy.
 */
describe('refreshChapterMetadataIfOnline pericope hydration after metadata import', () => {
  const fia1peVerses = loadBundledPericopeSet(FIA_SET_ID, '1PE');
  const bundledFiaVersion = getBundledPericopeSetVersion(FIA_SET_ID);

  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');

    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    userHasLocalChapterAssignments.mockResolvedValue(true);
    userNeedsAssigneeRepair.mockResolvedValue(false);
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    (FluentAPI.getUserMilestones as jest.Mock).mockResolvedValue([]);
    (FluentAPI.getChapterAssignments as jest.Mock).mockResolvedValue({
      syncedAt: '2026-10-21T12:00:00.000Z',
      data: [],
    });
    (FluentAPI.getUserChapterAssignments as jest.Mock).mockResolvedValue({
      assignedChapters: [],
      peerCheckChapters: [],
    });
    (FluentAPI.getPericopeSet as jest.Mock).mockResolvedValue({
      status: 304,
      etag: null,
    });
    // Simulate chapters that just landed via the metadata assignment pull.
    getChaptersNeedingPericopeSync.mockResolvedValue([
      {
        projectId: 15,
        bookId: 60,
        bookCode: '1PE',
        chapterNumber: 1,
      },
      {
        projectId: 15,
        bookId: 60,
        bookCode: '1PE',
        chapterNumber: 2,
      },
    ]);
    getProjectPericopeSetId.mockResolvedValue(FIA_SET_ID);
    (getPericopeBookVersion as jest.Mock).mockReturnValue('');
  });

  it('hydrates bundled FIA set2 1PE boundaries after ordinary metadata refresh', async () => {
    expect(fia1peVerses).not.toBeNull();
    expect(fia1peVerses).toHaveLength(105);
    const ch1Groups = new Set(
      fia1peVerses!
        .filter(v => v.chapterNumber === 1)
        .map(v => v.pericopeNumber),
    );
    expect(ch1Groups.size).toBe(4);

    await refreshChapterMetadataIfOnline(2);

    expect(FluentAPI.getUserProjects).toHaveBeenCalled();
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalled();
    expect(upsertPericopeSet).toHaveBeenCalledTimes(1);
    expect(upsertPericopeSet).toHaveBeenCalledWith(
      FIA_SET_ID,
      '1PE',
      fia1peVerses,
    );
    expect(setPericopeBookVersion).toHaveBeenCalledWith(
      FIA_SET_ID,
      '1PE',
      bundledFiaVersion,
    );
    // Bundled path — no set-level HTTP, and never chapter-pericope HTTP.
    expect(FluentAPI.getPericopeSet).not.toHaveBeenCalled();
  });

  it('skips upsert when the imported project has a null pericope set', async () => {
    getProjectPericopeSetId.mockResolvedValue(null);

    await refreshChapterMetadataIfOnline(2);

    expect(upsertPericopeSet).not.toHaveBeenCalled();
    expect(FluentAPI.getPericopeSet).not.toHaveBeenCalled();
  });

  it('does not hydrate pericopes when the user is no longer active', async () => {
    (getActiveUserId as jest.Mock).mockReturnValue('9');

    await refreshChapterMetadataIfOnline(2);

    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
    expect(upsertPericopeSet).not.toHaveBeenCalled();
  });

  it('keeps metadata refresh non-blocking when pericope hydrate throws', async () => {
    upsertPericopeSet.mockRejectedValueOnce(new Error('pericope write failed'));

    await expect(refreshChapterMetadataIfOnline(2)).resolves.toBeUndefined();
  });

  it('skips reseed when the bundled FIA book version is already current', async () => {
    (getPericopeBookVersion as jest.Mock).mockReturnValue(bundledFiaVersion);

    await refreshChapterMetadataIfOnline(2);

    expect(upsertPericopeSet).not.toHaveBeenCalled();
    expect(FluentAPI.getPericopeSet).not.toHaveBeenCalled();
  });

  it('passes the captured session token for unbundled pericope set GETs (#294)', async () => {
    getProjectPericopeSetId.mockResolvedValue(99);
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'user-2-metadata-token',
    });
    (FluentAPI.getPericopeSet as jest.Mock).mockResolvedValue({
      status: 200,
      etag: '"etag-99"',
      data: [
        {
          bookCode: '1PE',
          pericopeNumber: '1',
          pericopeTitle: null,
          verses: [{ chapterNumber: 1, verseNumber: 1 }],
        },
      ],
    });

    await refreshChapterMetadataIfOnline(2);

    expect(FluentAPI.getPericopeSet).toHaveBeenCalledWith(
      99,
      {
        bookCode: '1PE',
        etag: null,
      },
      'user-2-metadata-token',
    );
    expect(authToken.set).not.toHaveBeenCalled();
  });
});

describe('org grant hydration wiring (#452 prerequisite)', () => {
  const mockPersistOrgGrants = persistOrgGrantsFromUserResponse as jest.Mock;
  const mockRefreshUserOrgGrants = refreshUserOrgGrants as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (
      jest.requireMock('./storage').getBibleTextChapterSyncedAt as jest.Mock
    ).mockReturnValue('2026-01-01T00:00:00.000Z');
    __resetFullSyncSingleFlightForTests();
    jest.spyOn(syncEvents, 'emitAuthReauthRequired');
    jest.spyOn(syncEvents, 'emitSyncStart').mockImplementation(() => {});
    jest.spyOn(syncEvents, 'emitSyncComplete').mockImplementation(() => {});

    mockGetConnectivitySnapshot.mockResolvedValue({
      isOnline: true,
      isWifi: true,
      isCellular: false,
      connectionType: 'wifi',
    });
    (getUserIdSync as jest.Mock).mockReturnValue('2');
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
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalProjects.mockResolvedValue(true);
    userHasLocalChapterAssignments.mockResolvedValue(true);
    userNeedsAssigneeRepair.mockResolvedValue(false);
    // Reset chapter fixtures left by progressive-login (#670) cases in this file.
    // Empty maps are valid coverage here: grant wiring must not depend on bible
    // text payloads; do not stub away #177 missing-chapter production errors.
    getChaptersToSync.mockResolvedValue(new Map());
    getMyWorkChaptersToSync.mockResolvedValue(new Map());
    getRecordingLinkedChaptersToSync.mockResolvedValue(new Map());
    (isBibleTextsServerIdRemapPending as jest.Mock).mockReturnValue(false);
    getLocalProjectIds.mockResolvedValue([]);
    mockRefreshUserOrgGrants.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    __resetFullSyncSingleFlightForTests();
  });

  it('persists grants from the loaded user after login account registration', async () => {
    const user = {
      id: 2,
      email: 'user2@test.com',
      orgGrants: [],
    };
    (FluentAPI.getUserByEmail as jest.Mock).mockResolvedValue(user);
    (getTempCredentials as jest.Mock).mockResolvedValue({
      token: 'login-token',
    });
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'login-token' });

    await syncAllData(false, 'user2@test.com');

    expect(mockPersistOrgGrants).toHaveBeenCalledWith('2', user);
    expect(setUserSync).toHaveBeenCalledWith('2', 'user2@test.com');
    const persistOrder = mockPersistOrgGrants.mock.invocationCallOrder[0];
    const projectsOrder = (FluentAPI.getUserProjects as jest.Mock).mock
      .invocationCallOrder[0];
    expect(persistOrder).toBeLessThan(projectsOrder);
  });

  it('persists grants after registerKnownUser on add-account sync', async () => {
    const user = {
      id: 247,
      email: 'b@example.com',
      orgGrants: [],
    };
    (getActiveUserId as jest.Mock).mockReturnValue('245');
    (FluentAPI.getUserByEmail as jest.Mock).mockResolvedValue(user);
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'b-token' });
    (getUserLastSyncedAt as jest.Mock).mockReturnValue('');
    userHasLocalChapterAssignments.mockResolvedValue(true);

    await syncAllData(false, 'b@example.com');

    expect(registerKnownUser).toHaveBeenCalledWith('247', 'b@example.com');
    expect(setUserSync).not.toHaveBeenCalled();
    expect(mockPersistOrgGrants).toHaveBeenCalledWith('247', user);
    const registerOrder = (registerKnownUser as jest.Mock).mock
      .invocationCallOrder[0];
    const persistOrder = mockPersistOrgGrants.mock.invocationCallOrder[0];
    expect(registerOrder).toBeLessThan(persistOrder);
  });

  it('starts master while grants refresh still pending (overlap with claims)', async () => {
    const cursor = '2024-01-01T00:00:00.000Z';
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'valid-token' });
    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getUserLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getMasterDataLastSyncedAt as jest.Mock).mockReturnValue(cursor);
    (getMasterDataUpdatedAt as jest.Mock).mockReturnValue(cursor);
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalChapterAssignments.mockResolvedValue(true);

    let resolveGrants: () => void = () => undefined;
    let resolveLanguages: (value: unknown) => void = () => undefined;
    mockRefreshUserOrgGrants.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          resolveGrants = resolve;
        }),
    );
    (FluentAPI.getLanguages as jest.Mock).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveLanguages = resolve;
        }),
    );

    const pending = syncAllData(true);

    // Master (getLanguages) and claims must start before grants refresh resolves.
    // Re-awaiting refresh before masterPromise would leave getLanguages uncalled here.
    await waitFor(() => {
      expect(mockRefreshUserOrgGrants).toHaveBeenCalledWith('2', 'valid-token');
      expect(syncPendingChapterClaims).toHaveBeenCalledWith(
        2,
        expect.any(String),
      );
      expect(FluentAPI.getLanguages).toHaveBeenCalledWith(
        cursor,
        'valid-token',
      );
    });
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();

    resolveGrants();
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();

    resolveLanguages([]);
    await pending;

    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2, 'valid-token');
  });

  it('refreshes grants in syncAllUsers project loop with each captured token', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );

    await syncAllUsers();

    expect(mockRefreshUserOrgGrants).toHaveBeenCalledWith('1', 'user-1-token');
    expect(mockRefreshUserOrgGrants).toHaveBeenCalledWith('2', 'user-2-token');
    const refresh1 = mockRefreshUserOrgGrants.mock.invocationCallOrder[0];
    const refresh2 = mockRefreshUserOrgGrants.mock.invocationCallOrder[1];
    const projects1 = (FluentAPI.getUserProjects as jest.Mock).mock
      .invocationCallOrder[0];
    const claims1 = syncPendingChapterClaims.mock.invocationCallOrder[0];
    expect(claims1).toBeLessThan(refresh1);
    expect(refresh1).toBeLessThan(projects1);
    expect(refresh2).toBeGreaterThan(refresh1);
  });

  it('refreshes grants immediately before syncProjects on metadata refresh', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({
      token: 'user-2-specific-token',
    });

    await refreshChapterMetadataIfOnline(2);

    expect(mockRefreshUserOrgGrants).toHaveBeenCalledWith(
      '2',
      'user-2-specific-token',
    );
    const refreshOrder = mockRefreshUserOrgGrants.mock.invocationCallOrder[0];
    const claimsOrder = syncPendingChapterClaims.mock.invocationCallOrder[0];
    const projectsOrder = (FluentAPI.getUserProjects as jest.Mock).mock
      .invocationCallOrder[0];
    expect(claimsOrder).toBeLessThan(refreshOrder);
    expect(refreshOrder).toBeLessThan(projectsOrder);
  });
});
