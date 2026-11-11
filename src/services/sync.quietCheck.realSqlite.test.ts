// The catalogue quiet check against real SQLite (#886): its three local reads
// are skipped while the user and database write mark match the last check
// that found nothing waiting.
jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

let mockUserId = '7';
let mockQuietSince: number | null = null;
const mockSnapshot = jest.fn();

jest.mock('./storage', () => ({
  getActiveUserId: () => mockUserId,
  getUserIdSync: () => mockUserId,
  getCatalogueQuietSince: () => mockQuietSince,
  setCatalogueQuietSince: jest.fn(),
  clearCatalogueQuietSince: jest.fn(),
}));
jest.mock('./connectivity', () => ({
  getConnectivitySnapshot: (...args: unknown[]) => mockSnapshot(...args),
  SERVER_REACHABILITY_FRESH_MS: 5000,
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
import { getDatabaseWriteMark } from '../db/queries';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';
import {
  __resetMetadataRefreshFreshnessForTests,
  METADATA_REFRESH_FRESH_MS,
  refreshChapterMetadataIfOnline,
} from './sync';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

const isMark = (sql: string) => sql.includes('total_changes()');
const isClaims = (sql: string) => sql.includes('FROM chapter_claim_queue');
const isStages = (sql: string) => sql.includes('FROM stage_advance_queue');
const isRepair = (sql: string) => sql.includes('AS with_role');

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
    INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'not_started', '');
    INSERT INTO chapter_assignments(id, project_unit_id, bible_id, book_id, chapter_number,
      assigned_user_id, updated_at) VALUES (10, 12, 1, 40, 1, 7, '2026-01-01');
    INSERT INTO user_projects(user_id, project_id) VALUES (7, 1), (8, 1);
  `);
  return db;
}

const queueClaim = (db: DB) =>
  db.execute(
    `INSERT INTO chapter_claim_queue (chapter_assignment_id, user_id, claimed_at, sync_status)
     VALUES (10, 7, '2026-01-01', 'pending')`,
  );

describeReal('catalogue quiet check against real SQLite', () => {
  let db: DB;
  let sql: string[];
  let now: number;
  let failNext: ((statement: string) => boolean) | null;
  let duringStages: (() => Promise<unknown>) | null;

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
        if (duringStages && isStages(statement)) {
          const run = duringStages;
          duringStages = null;
          await run();
        }
        return result;
      });
  };
  const count = (match: (statement: string) => boolean) =>
    sql.filter(match).length;
  const quietReads = () => count(isClaims) + count(isStages) + count(isRepair);

  /** One Home focus past the 10 s light-refresh window. Resolves true when quiet. */
  const focus = async (userId = 7) => {
    now += METADATA_REFRESH_FRESH_MS + 1000;
    mockQuietSince = now - 60_000;
    mockSnapshot.mockClear();
    await refreshChapterMetadataIfOnline(userId);
    return mockSnapshot.mock.calls.length === 0;
  };

  beforeEach(async () => {
    __resetMetadataRefreshFreshnessForTests();
    mockUserId = '7';
    now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    // Offline: a check that is not quiet stops before any request.
    mockSnapshot.mockReset().mockResolvedValue({
      isOnline: false,
      isWifi: false,
      isCellular: false,
      connectionType: 'none',
    });
    sql = [];
    failNext = null;
    duringStages = null;
    db = await fixtureDb();
    setDatabase(db);
    watch(db);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db.close();
  });

  it('reads once, then only the write mark while nothing was written', async () => {
    expect(await focus()).toBe(true);
    expect(count(isMark)).toBe(1);
    expect(quietReads()).toBe(3);
    sql = [];

    expect(await focus()).toBe(true);
    expect(sql.filter(s => !isMark(s))).toHaveLength(0);
    expect(count(isMark)).toBe(1);
  });

  it('shares the mark with another caller in the same turn', async () => {
    await focus();
    sql = [];
    now += METADATA_REFRESH_FRESH_MS + 1000;
    mockQuietSince = now - 60_000;

    await Promise.all([
      getDatabaseWriteMark(),
      refreshChapterMetadataIfOnline(7),
    ]);

    expect(count(isMark)).toBe(1);
    expect(quietReads()).toBe(0);
  });

  it('finds a claim queued without a notification', async () => {
    await focus();
    await queueClaim(db);
    sql = [];

    expect(await focus()).toBe(false);
    expect(count(isClaims)).toBe(1);
  });

  it('finds a stage advance queued without a notification', async () => {
    await focus();
    await db.execute(
      `INSERT INTO stage_advance_queue (chapter_assignment_id, user_id, from_status,
         to_status, peer_checker_id, created_at, sync_status)
       VALUES (10, 7, 'draft', 'peer_check', NULL, '2026-01-01', 'pending')`,
    );

    expect(await focus()).toBe(false);
  });

  it('finds an assignee repair the rows now need', async () => {
    await focus();
    await db.execute(
      'UPDATE chapter_assignments SET assigned_user_id = NULL, peer_checker_id = NULL',
    );

    expect(await focus()).toBe(false);
  });

  it('finds a claim written while the check was reading', async () => {
    duringStages = () => queueClaim(db);
    expect(await focus()).toBe(true);
    sql = [];

    expect(await focus()).toBe(false);
    expect(count(isClaims)).toBe(1);
  });

  it('reads again for another user on the same connection', async () => {
    await focus(7);
    mockUserId = '8';
    sql = [];

    expect(await focus(8)).toBe(true);
    expect(quietReads()).toBe(3);
  });

  it('reads again on a replaced database connection', async () => {
    await focus();
    const replacement = await fixtureDb();
    setDatabase(replacement);
    watch(replacement);
    sql = [];

    expect(await focus()).toBe(true);
    expect(quietReads()).toBe(3);
    await replacement.close();
  });

  it('reads every time while the write mark is unreadable', async () => {
    failNext = isMark;
    expect(await focus()).toBe(true);
    failNext = isMark;
    expect(await focus()).toBe(true);

    expect(quietReads()).toBe(6);
  });

  it('refreshes after a failed read and never reuses it', async () => {
    await focus();
    await queueClaim(db);
    await db.execute('DELETE FROM chapter_claim_queue');
    failNext = isClaims;

    expect(await focus()).toBe(false);
    sql = [];

    expect(await focus()).toBe(true);
    expect(quietReads()).toBe(3);
  });

  it('reads nothing once the quiet window has passed', async () => {
    await focus();
    now += METADATA_REFRESH_FRESH_MS + 1000;
    mockQuietSince = null;
    sql = [];
    mockSnapshot.mockClear();

    await refreshChapterMetadataIfOnline(7);

    expect(mockSnapshot).toHaveBeenCalled();
    expect(sql).toHaveLength(0);
  });
});
