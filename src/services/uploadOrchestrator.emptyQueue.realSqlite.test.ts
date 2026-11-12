// Production wiring against real SQLite (#886): an automatic check that
// cleanly found nothing queued is not repeated while the database write mark
// and active user are unchanged.
jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

type ConnectivityListener = (
  online: boolean,
  wifi: boolean,
  cellular?: boolean,
  type?: string,
) => void;
const mockListeners = new Set<ConnectivityListener>();
let mockUserId = '7';
const mockEmit = jest.fn();
const mockPushClaims = jest.fn();
const mockPushStages = jest.fn();

jest.mock('./connectivity', () => ({
  subscribeToConnectivity: (listener: ConnectivityListener) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
  getConnectivitySnapshot: async () => ({
    isOnline: true,
    isWifi: true,
    isCellular: false,
    connectionType: 'wifi',
  }),
  getRecentOnlineReachability: () => null,
}));
jest.mock('./userPreferences', () => ({
  getUploadOverCellular: () => false,
  subscribeToPreference: () => () => undefined,
}));
jest.mock('./storage', () => ({
  getActiveUserId: () => mockUserId,
  getUserIdSync: () => mockUserId,
  getSyncPausedUntilMs: () => null,
  setSyncPausedUntilMs: jest.fn(),
  setReauthRequired: jest.fn(),
}));
jest.mock('./sync', () => ({
  syncPendingChapterClaimsForUser: (...args: unknown[]) =>
    mockPushClaims(...args),
  syncPendingStageAdvancesForUser: (...args: unknown[]) =>
    mockPushStages(...args),
}));
jest.mock('./keychain', () => ({
  getCredentials: async () => ({ token: 'owner-token' }),
}));
jest.mock('./syncEvents', () => ({
  emitUploadSessionEvent: (event: unknown) => mockEmit(event),
  emitAuthReauthRequired: jest.fn(),
  onSyncComplete: jest.fn(),
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

import type { DB } from '@op-engineering/op-sqlite';
import { setDatabase } from '../db/db';
import { runMigrations } from '../db/migrations';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';
import {
  notifyPendingUploads,
  setDraftingUploadHold,
  startUploadOrchestrator,
  stopUploadOrchestrator,
  syncNowUploads,
} from './uploadOrchestrator';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

const isMark = (sql: string) => sql.includes('total_changes()');
const isChapters = (sql: string) =>
  sql.includes('FROM recording_deletions d') && sql.includes('UNION');
const isStages = (sql: string) =>
  /FROM stage_advance_queue\s+WHERE sync_status = 'pending'\s+ORDER BY/.test(
    sql,
  );
const isClaims = (sql: string) =>
  /FROM chapter_claim_queue\s+WHERE sync_status = 'pending' AND user_id/.test(
    sql,
  );

async function fixtureDb(): Promise<DB> {
  const db = createRealSqliteDb();
  await runMigrations(db);
  await db.execute(`
    INSERT INTO users(id, email) VALUES (7, 'a@example.test'), (8, 'b@example.test');
    INSERT INTO languages(id, lang_name, script_direction) VALUES (1, 'Fixture', 'ltr');
    INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew');
    INSERT INTO bibles(id, language_id, name, abbreviation) VALUES (1, 1, 'Fixture', 'FIX');
    INSERT INTO projects(id, name, source_language_id, target_language_id, is_active, status, updated_at)
      VALUES (1, 'Fixture', 1, 1, 1, 'not_assigned', '2026-01-01');
    INSERT INTO user_projects(user_id, project_id) VALUES (7, 1);
    INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'not_started', '');
    INSERT INTO chapter_assignments(id, project_unit_id, bible_id, book_id, chapter_number,
      assigned_user_id, updated_at) VALUES (10, 12, 1, 40, 1, 7, '2026-01-01');
    INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
      VALUES (1, 1, 40, 1, 1, 'Fixture');
  `);
  return db;
}

const saveTake = (db: DB) =>
  db.execute(
    `INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
       local_file_path, is_selected, sync_status, start_chapter, start_verse,
       end_chapter, end_verse, created_at, updated_at)
     VALUES ('take', 1, 7, 12, 'file:///take.m4a', 1, 'pending', 1, 1, 1, 1,
       '2026-01-01', '2026-01-01')`,
  );

const flush = async () => {
  for (let i = 0; i < 6; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
};

const publishOnline = async () => {
  for (const listener of [...mockListeners]) {
    listener(true, true, false, 'wifi');
  }
  await flush();
};

/** Leaving Drafting lifts the hold, which runs an automatic check. */
const returnHome = async () => {
  await setDraftingUploadHold(true);
  await setDraftingUploadHold(false);
  await flush();
};

describeReal('automatic empty-queue checks against real SQLite', () => {
  let db: DB;
  let sql: string[];
  let failNext: ((statement: string) => boolean) | null;
  let duringChapters: (() => Promise<void> | void) | null;
  const uploadChapter = jest.fn(async () => undefined);

  const watch = (target: DB) => {
    const realExecute = target.execute.bind(target);
    jest
      .spyOn(target, 'execute')
      .mockImplementation(async (statement: string, params?: unknown[]) => {
        sql.push(statement);
        if (failNext?.(statement)) {
          failNext = null;
          throw new Error('disk I/O error');
        }
        const result = await realExecute(statement, params as never);
        if (duringChapters && isChapters(statement)) {
          const run = duringChapters;
          duringChapters = null;
          await run();
        }
        return result;
      });
  };
  const count = (match: (statement: string) => boolean) =>
    sql.filter(match).length;
  const queueReads = () =>
    count(isChapters) + count(isStages) + count(isClaims);

  beforeEach(async () => {
    mockListeners.clear();
    mockUserId = '7';
    mockEmit.mockReset();
    mockPushClaims.mockReset().mockResolvedValue({ failed: 0, deferred: 0 });
    mockPushStages.mockReset().mockResolvedValue({ failed: 0, deferred: 0 });
    uploadChapter.mockClear();
    sql = [];
    failNext = null;
    duringChapters = null;
    db = await fixtureDb();
    setDatabase(db);
    watch(db);
    startUploadOrchestrator({
      worker: { uploadChapter },
      schedule: () => () => undefined,
    });
    await publishOnline();
  });

  afterEach(async () => {
    stopUploadOrchestrator();
    await db.close();
  });

  it('checks once, then skips the three queue reads while nothing was written', async () => {
    expect(count(isMark)).toBe(1);
    expect(queueReads()).toBe(3);
    sql = [];
    mockEmit.mockClear();

    await returnHome();
    await returnHome();

    expect(count(isMark)).toBe(2);
    expect(queueReads()).toBe(0);
    expect(mockEmit.mock.calls.filter(([e]) => e.type === 'idle')).toHaveLength(
      2,
    );
    expect(uploadChapter).not.toHaveBeenCalled();
  });

  it('reads again and uploads a take saved without a notification', async () => {
    await saveTake(db);
    sql = [];

    await returnHome();

    expect(count(isChapters)).toBeGreaterThanOrEqual(2);
    expect(uploadChapter).toHaveBeenCalledWith(
      { bookId: 40, chapterNumber: 1 },
      expect.anything(),
      expect.any(Function),
    );
  });

  it('reads again and drains a stage-only row', async () => {
    await db.execute(
      `INSERT INTO stage_advance_queue (chapter_assignment_id, user_id, from_status,
         to_status, peer_checker_id, created_at, sync_status)
       VALUES (10, 7, 'draft', 'peer_check', NULL, '2026-01-01', 'pending')`,
    );

    await returnHome();

    expect(mockPushStages).toHaveBeenCalledWith(7, 'owner-token');
    expect(uploadChapter).not.toHaveBeenCalled();
  });

  it('reads again and pushes a claim-only row', async () => {
    await db.execute(
      `INSERT INTO chapter_claim_queue (chapter_assignment_id, user_id, claimed_at, sync_status)
       VALUES (10, 7, '2026-01-01', 'pending')`,
    );

    await returnHome();

    expect(mockPushClaims).toHaveBeenCalledWith(7, 'owner-token');
  });

  it('finds a take written while the empty check was reading', async () => {
    stopUploadOrchestrator();
    duringChapters = () => saveTake(db).then(() => undefined);
    startUploadOrchestrator({
      worker: { uploadChapter },
      schedule: () => () => undefined,
    });
    await publishOnline();
    expect(uploadChapter).not.toHaveBeenCalled();

    await returnHome();

    expect(uploadChapter).toHaveBeenCalledTimes(1);
  });

  it('reads again after a queued-work notification', async () => {
    sql = [];

    notifyPendingUploads();
    await flush();

    expect(queueReads()).toBe(3);
  });

  it('does not keep an empty answer that a notification raced', async () => {
    stopUploadOrchestrator();
    sql = [];
    duringChapters = () => notifyPendingUploads();
    startUploadOrchestrator({
      worker: { uploadChapter },
      schedule: () => () => undefined,
    });
    await publishOnline();
    // The raced check, then the rerun it queued, both read.
    expect(queueReads()).toBe(6);
  });

  it('reads again for another account on the same connection', async () => {
    mockUserId = '8';
    sql = [];

    await returnHome();

    expect(queueReads()).toBe(3);
  });

  it('reads again on a replaced database connection', async () => {
    const replacement = await fixtureDb();
    setDatabase(replacement);
    watch(replacement);
    sql = [];

    await returnHome();

    expect(queueReads()).toBe(3);
    await replacement.close();
  });

  it('reads every time while the write mark is unreadable', async () => {
    sql = [];
    mockEmit.mockClear();
    failNext = isMark;
    await returnHome();
    failNext = isMark;
    await returnHome();

    expect(queueReads()).toBe(6);
    expect(mockEmit.mock.calls.filter(([e]) => e.type === 'idle')).toHaveLength(
      2,
    );
  });

  it('never reuses a failed queue read', async () => {
    stopUploadOrchestrator();
    failNext = isChapters;
    startUploadOrchestrator({
      worker: { uploadChapter },
      schedule: () => () => undefined,
    });
    await publishOnline();
    sql = [];

    await returnHome();

    expect(queueReads()).toBe(3);
  });

  it('reads again after the orchestrator restarts', async () => {
    stopUploadOrchestrator();
    startUploadOrchestrator({
      worker: { uploadChapter },
      schedule: () => () => undefined,
    });
    sql = [];

    await publishOnline();

    expect(queueReads()).toBe(3);
  });

  it('Sync Now always reads the queue', async () => {
    sql = [];

    await syncNowUploads();

    expect(queueReads()).toBe(3);
  });

  it('a queued automatic check costs the mark plus both queue reads', async () => {
    await saveTake(db);
    sql = [];

    await returnHome();

    // Check and post-probe re-read (3 each), then one re-read per uploaded chapter.
    expect(count(isMark)).toBe(1);
    expect(count(isStages)).toBe(2);
    expect(count(isClaims)).toBe(2);
    expect(count(isChapters)).toBe(3);
  });
});
