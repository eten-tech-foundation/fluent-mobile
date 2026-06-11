import { AuthError } from './authError';
import { FluentAPI, setActiveToken } from './api';
import { clearCredentials, getCredentials } from './keychain';
import { syncAllData, syncAllUsers } from './sync';
import * as syncEvents from './syncEvents';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserLastSyncedAt,
  setUserLastSyncedAt,
  getLastAssignmentSyncAt,
  getLastSyncedAt,
  getUserIdSync,
  setSyncError,
} from './storage';

jest.mock('./api', () => ({
  FluentAPI: {
    getLanguages: jest.fn().mockResolvedValue([]),
    getBooks: jest.fn().mockResolvedValue([]),
    getBibles: jest.fn().mockResolvedValue([]),
    getUserProjects: jest.fn(),
    getChapterAssignments: jest.fn().mockResolvedValue({ data: [] }),
    getBibleTexts: jest.fn(),
  },
  setActiveToken: jest.fn(),
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
  ensureUserProjectMembership: jest.fn().mockResolvedValue(undefined),
  insertChapterAssignmentSyncData: jest.fn().mockResolvedValue(undefined),
  insertBibleTexts: jest.fn().mockResolvedValue(undefined),
  getChaptersToSync: jest.fn().mockResolvedValue(new Map()),
  getLocalProjectIds: jest.fn().mockResolvedValue([1]),
  userHasLocalProjects: jest.fn().mockResolvedValue(true),
  userHasLocalChapterAssignments: jest.fn().mockResolvedValue(true),
  insertUser: jest.fn().mockResolvedValue(undefined),
}));

const {
  getChaptersToSync,
  userHasLocalProjects,
  userHasLocalChapterAssignments,
} = jest.requireMock('../db/repository') as {
  getChaptersToSync: jest.Mock;
  userHasLocalProjects: jest.Mock;
  userHasLocalChapterAssignments: jest.Mock;
};

jest.mock('../db/db', () => ({
  getDatabase: jest.fn(() => ({
    execute: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
  })),
}));

describe('syncAllData auth handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(syncEvents, 'emitAuthSessionExpired');
    jest.spyOn(syncEvents, 'emitSyncStart').mockImplementation(() => {});
    jest.spyOn(syncEvents, 'emitSyncComplete').mockImplementation(() => {});

    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (getActiveUserId as jest.Mock).mockReturnValue('2');
    (getLastSyncedAt as jest.Mock).mockReturnValue('2026-06-01T00:00:00.000Z');
    (getLastAssignmentSyncAt as jest.Mock).mockReturnValue(
      '2026-06-01T00:00:00.000Z',
    );
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalProjects.mockResolvedValue(true);
    userHasLocalChapterAssignments.mockResolvedValue(true);
    getChaptersToSync.mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits auth session expired when incremental sync has no stored token', async () => {
    (getCredentials as jest.Mock).mockResolvedValue(null);

    await expect(syncAllData(true)).rejects.toThrow(
      'No session token. Please sign in again.',
    );

    expect(clearCredentials).toHaveBeenCalledWith('2');
    expect(setActiveToken).toHaveBeenCalledWith(null);
    expect(syncEvents.emitAuthSessionExpired).toHaveBeenCalled();
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
  });

  it('clears credentials for the syncing user when project sync returns 401', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'revoked-token' });
    (getActiveUserId as jest.Mock).mockReturnValue('1');
    (getUserIdSync as jest.Mock).mockReturnValue('2');
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new AuthError('Invalid or revoked session token'),
    );

    await expect(syncAllData(true)).rejects.toThrow(AuthError);

    expect(clearCredentials).toHaveBeenCalledWith('2');
    expect(clearCredentials).not.toHaveBeenCalledWith('1');
  });

  it('clears credentials and emits auth session expired when project sync returns 401', async () => {
    (getCredentials as jest.Mock).mockResolvedValue({ token: 'revoked-token' });
    (FluentAPI.getUserProjects as jest.Mock).mockRejectedValue(
      new AuthError('Invalid or revoked session token'),
    );

    await expect(syncAllData(true)).rejects.toThrow(AuthError);

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(1);
    expect(clearCredentials).toHaveBeenCalledWith('2');
    expect(setActiveToken).toHaveBeenCalledWith(null);
    expect(syncEvents.emitAuthSessionExpired).toHaveBeenCalled();
    expect(setSyncError).toHaveBeenCalledWith(
      'sync_error_projects',
      'Invalid or revoked session token',
    );
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
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
    userHasLocalChapterAssignments.mockResolvedValue(false);

    await syncAllData(true);

    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
    );
  });
});

describe('syncAllUsers auth handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(syncEvents, 'emitAuthSessionExpired');
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
    (FluentAPI.getUserProjects as jest.Mock).mockResolvedValue({ data: [] });
    userHasLocalProjects.mockResolvedValue(true);
    userHasLocalChapterAssignments.mockResolvedValue(true);
    getChaptersToSync.mockResolvedValue(new Map());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('syncs every known user on the device', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );

    await syncAllUsers();

    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(2);
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(1);
    expect(FluentAPI.getUserProjects).toHaveBeenCalledWith(2);
    expect(setActiveToken).toHaveBeenLastCalledWith('user-2-token');
    expect(setUserLastSyncedAt).toHaveBeenCalledWith('1', expect.any(String));
    expect(setUserLastSyncedAt).toHaveBeenCalledWith('2', expect.any(String));
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('emits auth session expired when the active user has no stored token', async () => {
    (getCredentials as jest.Mock).mockResolvedValue(null);

    await expect(syncAllUsers()).rejects.toThrow(
      'No session token. Please sign in again.',
    );

    expect(clearCredentials).toHaveBeenCalledWith('2');
    expect(setActiveToken).toHaveBeenCalledWith(null);
    expect(syncEvents.emitAuthSessionExpired).toHaveBeenCalled();
    expect(FluentAPI.getUserProjects).not.toHaveBeenCalled();
    expect(syncEvents.emitSyncComplete).toHaveBeenCalled();
  });

  it('clears stale credentials for non-active users but continues syncing', async () => {
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

    expect(clearCredentials).toHaveBeenCalledWith('1');
    expect(clearCredentials).not.toHaveBeenCalledWith('2');
    expect(syncEvents.emitAuthSessionExpired).not.toHaveBeenCalled();
    expect(FluentAPI.getUserProjects).toHaveBeenCalledTimes(2);
    expect(setActiveToken).toHaveBeenLastCalledWith('user-2-token');
  });

  it('runs full bible text sync when any user had a full assignment sync', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    userHasLocalProjects.mockImplementation(
      async (userId: number) => userId === 1,
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

    await syncAllUsers();

    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      1,
      [{ bookId: 1, chapterNumber: 1 }],
      undefined,
    );
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
    );
    expect(FluentAPI.getChapterAssignments).toHaveBeenCalledWith(
      2,
      undefined,
      undefined,
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

  it('uses the oldest per-user assignment cursor for bible text sync', async () => {
    (getCredentials as jest.Mock).mockImplementation(async (userId: string) =>
      userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
    );
    (getUserLastSyncedAt as jest.Mock).mockImplementation((userId: string) =>
      userId === '1' ? '2026-06-01T00:00:00.000Z' : '2026-05-01T00:00:00.000Z',
    );
    getChaptersToSync.mockResolvedValue(
      new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
    );
    (FluentAPI.getBibleTexts as jest.Mock).mockResolvedValue({ data: [] });

    await syncAllUsers();

    expect(FluentAPI.getBibleTexts).toHaveBeenCalledWith(
      1,
      [{ bookId: 1, chapterNumber: 1 }],
      '2026-05-01T00:00:00.000Z',
    );
  });
});
