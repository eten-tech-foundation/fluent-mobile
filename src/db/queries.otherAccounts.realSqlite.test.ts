jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

import type { DB } from '@op-engineering/op-sqlite';
import { setDatabase } from './db';
import { runMigrations } from './migrations';
import {
  assignmentHasPendingUploads,
  getDevicePendingUploadChapters,
  getOtherAccountsPendingSummary,
  getTakeIdsWaitingOnOtherAccounts,
} from './queries';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

// #847 shape: A (7) drafts Matthew 1 and sends it to Peer Check; B (8) then
// records on the same chapter. Both are members of project 1.
const A = 7;
const B = 8;
const ADVANCED_AT = '2026-10-27T10:00:00.000Z';
const BEFORE = '2026-10-27T09:00:00.000Z';
const AFTER = '2026-10-27T11:00:00.000Z';

async function fixtureDb(): Promise<DB> {
  const db = createRealSqliteDb();
  await runMigrations(db);
  await db.execute(`
    INSERT INTO users(id, email) VALUES
      (7, 'a@example.test'), (8, 'b@example.test'), (9, 'c@example.test');
    INSERT INTO languages(id, lang_name, script_direction) VALUES (1, 'Fixture', 'ltr');
    INSERT INTO books(id, code, eng_display_name) VALUES (40, 'MAT', 'Matthew');
    INSERT INTO bibles(id, language_id, name, abbreviation) VALUES (1, 1, 'Fixture', 'FIX');
    INSERT INTO projects(id, name, source_language_id, target_language_id, is_active, status, updated_at)
      VALUES (1, 'Fixture', 1, 1, 1, 'not_assigned', '2026-01-01');
    INSERT INTO user_projects(user_id, project_id) VALUES (7, 1), (8, 1);
    INSERT INTO project_units(id, project_id, status, name) VALUES (12, 1, 'draft', '');
    INSERT INTO chapter_assignments(id, project_unit_id, bible_id, book_id, chapter_number,
      assigned_user_id, updated_at) VALUES
      (10, 12, 1, 40, 1, 7, '2026-01-01'),
      (11, 12, 1, 40, 2, 7, '2026-01-01');
    INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text) VALUES
      (1, 1, 40, 1, 1, 'Fixture'),
      (2, 1, 40, 2, 1, 'Fixture');
  `);
  return db;
}

async function saveTake(
  db: DB,
  id: string,
  owner: number | null,
  createdAt: string,
  options: {
    bibleTextId?: number;
    status?: string;
    projectUnitId?: number | null;
  } = {},
): Promise<void> {
  await db.execute(
    `INSERT INTO recordings(id, bible_text_id, recorded_by_user_id, project_unit_id,
       local_file_path, is_selected, sync_status, start_chapter, start_verse,
       end_chapter, end_verse, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'file:///take.m4a', 1, ?, 1, 1, 1, 1, ?, ?)`,
    [
      id,
      options.bibleTextId ?? 1,
      owner,
      options.projectUnitId === undefined ? 12 : options.projectUnitId,
      options.status ?? 'pending',
      createdAt,
      createdAt,
    ],
  );
}

async function queueStageAdvance(
  db: DB,
  owner: number,
  options: { assignmentId?: number; status?: string } = {},
): Promise<void> {
  await db.execute(
    `INSERT INTO stage_advance_queue(chapter_assignment_id, user_id, from_status,
       to_status, created_at, sync_status)
     VALUES (?, ?, 'draft', 'peer_check', ?, ?)`,
    [
      options.assignmentId ?? 10,
      owner,
      ADVANCED_AT,
      options.status ?? 'pending',
    ],
  );
}

describeReal('other accounts on the device (#854)', () => {
  let db: DB;

  beforeEach(async () => {
    db = await fixtureDb();
    setDatabase(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('getTakeIdsWaitingOnOtherAccounts', () => {
    const waiting = (ids: string[], verified: number[] = [A, B]) =>
      getTakeIdsWaitingOnOtherAccounts(ids, B, verified);

    it("holds B's take recorded after A's still-queued stage advance", async () => {
      await queueStageAdvance(db, A);
      await saveTake(db, 'b-after', B, AFTER);

      await expect(waiting(['b-after'])).resolves.toEqual(new Set(['b-after']));
    });

    it("does not hold B's take recorded before A's advance", async () => {
      await queueStageAdvance(db, A);
      await saveTake(db, 'b-before', B, BEFORE);

      await expect(waiting(['b-before'])).resolves.toEqual(new Set());
    });

    it("never holds A's own takes behind A's own advance", async () => {
      await queueStageAdvance(db, A);
      await saveTake(db, 'a-after', A, AFTER);

      await expect(waiting(['a-after'])).resolves.toEqual(new Set());
    });

    it("releases B's take once A's advance is no longer pending", async () => {
      await queueStageAdvance(db, A, { status: 'synced' });
      await saveTake(db, 'b-after', B, AFTER);

      await expect(waiting(['b-after'])).resolves.toEqual(new Set());
    });

    it("does not hold B's take on a different chapter", async () => {
      await queueStageAdvance(db, A, { assignmentId: 11 });
      await saveTake(db, 'b-after', B, AFTER);

      await expect(waiting(['b-after'])).resolves.toEqual(new Set());
    });

    it('releases B when A was confirmed removed from the project (#855)', async () => {
      await db.execute('DELETE FROM user_projects WHERE user_id = ?', [A]);
      await queueStageAdvance(db, A);
      await saveTake(db, 'b-after', B, AFTER);

      await expect(waiting(['b-after'], [A, B])).resolves.toEqual(new Set());
    });

    it("resolves a take recorded without a unit to the chapter's only unit", async () => {
      await queueStageAdvance(db, A);
      await saveTake(db, 'b-no-unit', B, AFTER, { projectUnitId: null });

      await expect(waiting(['b-no-unit'])).resolves.toEqual(
        new Set(['b-no-unit']),
      );
    });

    it("does not hold a unit-less take behind another project's advance on the same chapter", async () => {
      await db.execute(`
        INSERT INTO project_units(id, project_id, status, name) VALUES (13, 1, 'draft', '');
        INSERT INTO chapter_assignments(id, project_unit_id, bible_id, book_id, chapter_number,
          assigned_user_id, updated_at) VALUES (12, 13, 1, 40, 1, 7, '2026-01-01');
      `);
      await queueStageAdvance(db, A, { assignmentId: 12 });
      await saveTake(db, 'b-no-unit', B, AFTER, { projectUnitId: null });

      await expect(waiting(['b-no-unit'])).resolves.toEqual(new Set());
    });

    it("keeps B held when A's membership could not be confirmed", async () => {
      await db.execute('DELETE FROM user_projects WHERE user_id = ?', [A]);
      await queueStageAdvance(db, A);
      await saveTake(db, 'b-after', B, AFTER);

      // A is not verified (signed out): its cached membership is not trusted.
      await expect(waiting(['b-after'], [B])).resolves.toEqual(
        new Set(['b-after']),
      );
    });
  });

  describe('assignmentHasPendingUploads with a cutoff', () => {
    it("holds A's stage advance for A's earlier take, not a later one", async () => {
      await saveTake(db, 'a-after', A, AFTER);

      // No cutoff: any pending take of A's holds the advance, as before.
      await expect(assignmentHasPendingUploads(10, A)).resolves.toBe(true);
      // A take recorded after the advance was queued does not hold it.
      await expect(
        assignmentHasPendingUploads(10, A, ADVANCED_AT),
      ).resolves.toBe(false);

      await saveTake(db, 'a-before', A, BEFORE, { bibleTextId: 1 });
      await expect(
        assignmentHasPendingUploads(10, A, ADVANCED_AT),
      ).resolves.toBe(true);
    });

    it('applies the cutoff to queued deletes too', async () => {
      const queueDelete = (createdAt: string) =>
        db.execute(
          `INSERT INTO recording_deletions(id, project_unit_id, bible_text_id,
             server_take_id, recorded_by_user_id, created_at)
           VALUES (?, 12, 1, 55, ?, ?)`,
          [`del-${createdAt}`, A, createdAt],
        );
      await queueDelete(AFTER);
      await expect(
        assignmentHasPendingUploads(10, A, ADVANCED_AT),
      ).resolves.toBe(false);

      await queueDelete(BEFORE);
      await expect(
        assignmentHasPendingUploads(10, A, ADVANCED_AT),
      ).resolves.toBe(true);
    });
  });

  describe('getDevicePendingUploadChapters', () => {
    it("lists another account's chapter that the active account has no work in", async () => {
      await saveTake(db, 'a-take', A, BEFORE);
      await saveTake(db, 'b-take', B, AFTER, { bibleTextId: 2 });

      await expect(getDevicePendingUploadChapters()).resolves.toEqual([
        { bookId: 40, chapterNumber: 1 },
        { bookId: 40, chapterNumber: 2 },
      ]);
    });

    it('leaves out held and uploaded takes', async () => {
      await saveTake(db, 'held', B, AFTER, { status: 'held' });
      await saveTake(db, 'done', B, AFTER, {
        bibleTextId: 2,
        status: 'uploaded',
      });

      await expect(getDevicePendingUploadChapters()).resolves.toEqual([]);
    });
  });

  describe('getOtherAccountsPendingSummary', () => {
    it("counts other accounts' takes and stage changes, not the active account's", async () => {
      await saveTake(db, 'a-take', A, BEFORE);
      await saveTake(db, 'b-take', B, AFTER);
      await queueStageAdvance(db, B);
      await queueStageAdvance(db, A);

      await expect(getOtherAccountsPendingSummary(A)).resolves.toEqual({
        count: 2,
        ownerIds: [B],
      });
    });

    it('leaves out held takes and legacy takes with no owner', async () => {
      await saveTake(db, 'held', B, AFTER, { status: 'held' });
      await saveTake(db, 'legacy', null, AFTER);

      await expect(getOtherAccountsPendingSummary(A)).resolves.toEqual({
        count: 0,
        ownerIds: [],
      });
    });

    it('lists an account whose only queued work is a claim, without counting it', async () => {
      await db.execute(
        `INSERT INTO chapter_claim_queue(chapter_assignment_id, user_id, claimed_at)
         VALUES (10, 9, ?)`,
        [AFTER],
      );

      await expect(getOtherAccountsPendingSummary(A)).resolves.toEqual({
        count: 0,
        ownerIds: [9],
      });
    });

    it('answers nothing with no active account', async () => {
      await saveTake(db, 'b-take', B, AFTER);

      await expect(getOtherAccountsPendingSummary(null)).resolves.toEqual({
        count: 0,
        ownerIds: [],
      });
    });
  });
});
