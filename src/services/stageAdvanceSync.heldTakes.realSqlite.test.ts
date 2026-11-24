// #855 / #854: a held take is earlier work still waiting for project
// membership. The real drain, against real SQLite, must not send its account's
// later stage advance ahead of it, while unrelated stage advances still go.
jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

const mockGetChapterAssignment = jest.fn();
const mockSubmitChapterAssignment = jest.fn();
jest.mock('./api', () => ({
  FluentAPI: {
    getChapterAssignment: (...args: unknown[]) =>
      mockGetChapterAssignment(...args),
    submitChapterAssignment: (...args: unknown[]) =>
      mockSubmitChapterAssignment(...args),
  },
}));

import type { DB } from '@op-engineering/op-sqlite';
import { setDatabase } from '../db/db';
import { runMigrations } from '../db/migrations';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';
import {
  __resetStageAdvanceSyncForTests,
  drainStageAdvancesForAccounts,
} from './stageAdvanceSync';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

const A = 7;
const B = 8;
const BEFORE = '2026-10-27T09:00:00.000Z';
const ADVANCED_AT = '2026-10-27T10:00:00.000Z';
const AFTER = '2026-10-27T11:00:00.000Z';

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
    INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'draft', '');
    INSERT INTO chapter_assignments(id, project_unit_id, bible_id, book_id, chapter_number,
      assigned_user_id, status, updated_at) VALUES
      (10, 12, 1, 40, 1, 7, 'draft', '2026-01-01'),
      (11, 12, 1, 40, 2, 8, 'draft', '2026-01-01');
    INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text) VALUES
      (1, 1, 40, 1, 1, 'Fixture'),
      (2, 1, 40, 2, 1, 'Fixture');
  `);
  return db;
}

async function saveTake(
  db: DB,
  id: string,
  owner: number,
  status: string,
  createdAt: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
       local_file_path, is_selected, sync_status, start_chapter, start_verse,
       end_chapter, end_verse, created_at, updated_at)
     VALUES (?, 1, ?, 12, 'file:///take.m4a', 1, ?, 1, 1, 1, 1, ?, ?)`,
    [id, owner, status, createdAt, createdAt],
  );
}

async function queueAdvance(
  db: DB,
  owner: number,
  assignmentId: number,
): Promise<void> {
  await db.execute(
    `INSERT INTO stage_advance_queue(chapter_assignment_id, user_id, from_status,
       to_status, created_at, sync_status)
     VALUES (?, ?, 'draft', 'peer_check', ?, 'pending')`,
    [assignmentId, owner, ADVANCED_AT],
  );
}

async function pendingAdvances(db: DB): Promise<number[]> {
  const result = await db.execute(
    `SELECT chapter_assignment_id FROM stage_advance_queue
     WHERE sync_status = 'pending' ORDER BY id`,
  );
  return (result.rows ?? []).map(row => Number(row.chapter_assignment_id));
}

const drainBoth = () =>
  drainStageAdvancesForAccounts(
    new Map([
      [A, 'token-a'],
      [B, 'token-b'],
    ]),
    () => true,
  );

describeReal('stage advances behind held takes (#855, real SQLite)', () => {
  let db: DB;

  beforeEach(async () => {
    __resetStageAdvanceSyncForTests();
    jest.clearAllMocks();
    db = await fixtureDb();
    setDatabase(db);
    mockGetChapterAssignment.mockImplementation(async (id: number) => ({
      chapterAssignmentId: id,
      status: 'draft',
    }));
    mockSubmitChapterAssignment.mockImplementation(async (id: number) => ({
      chapterAssignmentId: id,
      status: 'peer_check',
    }));
  });

  afterEach(async () => {
    await db.close();
  });

  it("holds A's advance behind A's earlier held take, and sends it once the take uploads", async () => {
    await saveTake(db, 'a-held', A, 'held', BEFORE);
    await queueAdvance(db, A, 10);
    // B's advance on another chapter is unrelated and must still go.
    await queueAdvance(db, B, 11);

    await expect(drainBoth()).resolves.toMatchObject({ synced: 1, failed: 0 });
    expect(mockSubmitChapterAssignment.mock.calls).toEqual([[11, 'token-b']]);
    await expect(pendingAdvances(db)).resolves.toEqual([10]);

    // Membership returns, the take is released and uploads.
    await db.execute(
      `UPDATE recordings SET sync_status = 'uploaded' WHERE id = 'a-held'`,
    );
    await expect(drainBoth()).resolves.toMatchObject({ synced: 1 });
    expect(mockSubmitChapterAssignment).toHaveBeenLastCalledWith(10, 'token-a');
    await expect(pendingAdvances(db)).resolves.toEqual([]);
  });

  it('is not held by a held take recorded after the advance', async () => {
    await saveTake(db, 'a-held-later', A, 'held', AFTER);
    await queueAdvance(db, A, 10);

    await expect(drainBoth()).resolves.toMatchObject({ synced: 1 });
    expect(mockSubmitChapterAssignment).toHaveBeenCalledWith(10, 'token-a');
  });

  it("is not held by another account's held take", async () => {
    await saveTake(db, 'b-held', B, 'held', BEFORE);
    await queueAdvance(db, A, 10);

    await expect(drainBoth()).resolves.toMatchObject({ synced: 1 });
    expect(mockSubmitChapterAssignment).toHaveBeenCalledWith(10, 'token-a');
  });
});
