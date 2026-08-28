import { FluentAPI } from './api';
import {
  syncBibleTexts,
  syncChapterAssignments,
  syncMasterData,
  syncProjects,
} from './sync';
import { clearSyncError, setSyncCount, setSyncError } from './storage';
import { getDatabase } from '../db/db';
import {
  getChaptersToSync,
  insertBibleTexts,
  insertChapterAssignmentSyncData,
  insertMasterData,
  insertProjects,
  insertUserProjects,
  reconcileUserProjects,
  ensureUserProjectMembership,
} from '../db/repository';

jest.mock('./authToken', () => ({
  authToken: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getLanguages: jest.fn().mockResolvedValue([]),
    getBooks: jest.fn().mockResolvedValue([]),
    getBibles: jest.fn().mockResolvedValue([]),
    getUserByEmail: jest.fn(),
    getUserProjects: jest.fn(),
    getChapterAssignments: jest.fn().mockResolvedValue({ data: [] }),
    getUserChapterAssignments: jest.fn().mockResolvedValue({
      assignedChapters: [],
      peerCheckChapters: [],
    }),
    getBibleTexts: jest.fn(),
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
    SYNC_ERROR_PROJECT_UNITS: 'sync_error_project_units',
    SYNC_ERROR_BIBLE_TEXTS: 'sync_error_bible_texts',
  },
  getUserIdSync: jest.fn(),
  getActiveUserId: jest.fn(),
  getUserEmailSync: jest.fn(),
  getLastSyncedAt: jest.fn(),
  getLastAssignmentSyncAt: jest.fn(),
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
}));

jest.mock('../db/repository', () => ({
  insertMasterData: jest.fn().mockResolvedValue(undefined),
  insertProjects: jest.fn().mockResolvedValue(undefined),
  insertUserProjects: jest.fn().mockResolvedValue(undefined),
  reconcileUserProjects: jest.fn().mockResolvedValue(undefined),
  reconcileUserChapterWork: jest.fn().mockResolvedValue(undefined),
  ensureUserProjectMembership: jest.fn().mockResolvedValue(undefined),
  insertChapterAssignmentSyncData: jest.fn().mockResolvedValue(undefined),
  insertBibleTexts: jest.fn().mockResolvedValue(undefined),
  getChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getLocalProjectIds: jest.fn().mockResolvedValue([1]),
  userHasLocalProjects: jest.fn().mockResolvedValue(true),
  userHasLocalChapterAssignments: jest.fn().mockResolvedValue(true),
  userNeedsAssigneeRepair: jest.fn().mockResolvedValue(false),
  insertUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../db/db', () => ({
  getDatabase: jest.fn(() => ({
    execute: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
  })),
}));

const insertMasterDataMock = jest.mocked(insertMasterData);
const insertProjectsMock = jest.mocked(insertProjects);
const insertUserProjectsMock = jest.mocked(insertUserProjects);
const reconcileUserProjectsMock = jest.mocked(reconcileUserProjects);
const ensureUserProjectMembershipMock = jest.mocked(
  ensureUserProjectMembership,
);
const insertChapterAssignmentSyncDataMock = jest.mocked(
  insertChapterAssignmentSyncData,
);
const insertBibleTextsMock = jest.mocked(insertBibleTexts);
const getChaptersToSyncMock = jest.mocked(getChaptersToSync);
const setSyncErrorMock = jest.mocked(setSyncError);
const clearSyncErrorMock = jest.mocked(clearSyncError);
const setSyncCountMock = jest.mocked(setSyncCount);

function mockDbCount(count: number) {
  (getDatabase as jest.Mock).mockReturnValue({
    execute: jest.fn().mockResolvedValue({ rows: [{ count }] }),
  });
}

describe('sync step orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbCount(0);
    (FluentAPI.getLanguages as jest.Mock).mockResolvedValue([
      { id: 1, name: 'English' },
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
  });

  describe('syncMasterData', () => {
    it('inserts languages, books, and bibles then clears the error key', async () => {
      await syncMasterData();

      expect(insertMasterDataMock).toHaveBeenCalledWith(
        [{ id: 1, name: 'English' }],
        [{ id: 1, name: 'Genesis' }],
        [{ id: 10, name: 'Source' }],
      );
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_master_data');
    });

    it('retries non-auth failures then sets the sync error', async () => {
      jest.useFakeTimers();
      (FluentAPI.getLanguages as jest.Mock).mockRejectedValue(
        new Error('network'),
      );

      try {
        const pending = syncMasterData();
        const expectation = expect(pending).rejects.toThrow('network');

        await jest.advanceTimersByTimeAsync(500);
        await jest.advanceTimersByTimeAsync(1000);
        await expectation;

        expect(FluentAPI.getLanguages).toHaveBeenCalledTimes(3);
        expect(setSyncErrorMock).toHaveBeenCalledWith(
          'sync_error_master_data',
          'network',
        );
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
      expect(reconcileUserProjectsMock).toHaveBeenCalledWith(2, [7]);
      expect(ensureUserProjectMembershipMock).toHaveBeenCalledWith(2);
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_projects', 1);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_projects');
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
  });

  describe('syncBibleTexts', () => {
    it('short-circuits when there are no chapters to sync', async () => {
      await syncBibleTexts();

      expect(FluentAPI.getBibleTexts).not.toHaveBeenCalled();
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_bibles', 0);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_bible_texts');
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
            verses: [{ verseNumber: 1, text: 'In the beginning' }],
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
              verse_number: 1,
              text: 'In the beginning',
            }),
          ],
        }),
      ]);
      expect(setSyncCountMock).toHaveBeenCalledWith('sync_count_bibles', 2);
      expect(clearSyncErrorMock).toHaveBeenCalledWith('sync_error_bible_texts');
    });
  });
});
