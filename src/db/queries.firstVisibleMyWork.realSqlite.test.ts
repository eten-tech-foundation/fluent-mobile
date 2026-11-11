// queries.ts reaches op-sqlite's KV Storage through parseUserId; the real
// driver here is the node:sqlite DB below, not this module.
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
import { getFirstVisibleMyWorkChapterGroups } from './queries';
import { getMyWorkChaptersToSync } from './repository';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const canUseRealSqlite = isNodeSqliteAvailable();
const USER = 5;

async function insertAssignment(
  db: DB,
  row: {
    id: number;
    unit: number;
    chapter: number;
    status: string;
    assignedUserId?: number | null;
    peerCheckerId?: number | null;
  },
): Promise<void> {
  await db.execute(
    `INSERT INTO chapter_assignments (
      id, project_unit_id, bible_id, book_id, chapter_number, status,
      assigned_user_id, peer_checker_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.unit,
      1,
      1,
      row.chapter,
      row.status,
      row.assignedUserId ?? null,
      row.peerCheckerId ?? null,
      '2024-01-01',
    ],
  );
}

/**
 * Projects 100 and 200 have the user as a member; 300 does not. Genesis 1 and
 * 2 are the user's assignments but Home does not list them (past drafting;
 * peer checker before Peer Check). Genesis 3 is the first chapter Home lists.
 */
async function seed(db: DB): Promise<void> {
  for (const id of [USER, 9]) {
    await db.execute('INSERT INTO users (id, email) VALUES (?, ?)', [
      id,
      `u${id}@example.com`,
    ]);
  }
  await db.execute(
    'INSERT INTO languages (id, lang_name, script_direction) VALUES (?, ?, ?)',
    [1, 'English', 'ltr'],
  );
  await db.execute(
    'INSERT INTO books (id, code, eng_display_name) VALUES (?, ?, ?)',
    [1, 'GEN', 'Genesis'],
  );
  await db.execute(
    'INSERT INTO bibles (id, language_id, name, abbreviation) VALUES (?, ?, ?, ?)',
    [1, 1, 'Test Bible', 'TST'],
  );
  for (const [project, unit] of [
    [100, 10],
    [200, 20],
    [300, 30],
  ]) {
    await db.execute(
      `INSERT INTO projects (
        id, name, source_language_id, target_language_id, is_active, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [project, `Project ${project}`, 1, 1, true, 'not_assigned', '2024-01-01'],
    );
    await db.execute(
      'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
      [unit, project, 'not_started', ''],
    );
  }
  for (const project of [100, 200]) {
    await db.execute(
      'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
      [USER, project],
    );
  }
  await insertAssignment(db, {
    id: 1,
    unit: 10,
    chapter: 1,
    status: 'community_review',
    assignedUserId: USER,
  });
  await insertAssignment(db, {
    id: 2,
    unit: 10,
    chapter: 2,
    status: 'draft',
    assignedUserId: 9,
    peerCheckerId: USER,
  });
  await insertAssignment(db, {
    id: 3,
    unit: 10,
    chapter: 3,
    status: 'draft',
    assignedUserId: USER,
  });
}

(canUseRealSqlite ? describe : describe.skip)(
  'first visible My Work chapter against real SQLite (#886)',
  () => {
    let db: DB;

    beforeEach(async () => {
      db = createRealSqliteDb();
      await runMigrations(db);
      await seed(db);
      setDatabase(db);
    });

    afterEach(async () => {
      await db.close();
    });

    it('skips earlier assignments Home does not list', async () => {
      // The sync's My Work set still carries the hidden chapters.
      expect((await getMyWorkChaptersToSync(USER)).get(1)).toEqual([
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
        { bookId: 1, chapterNumber: 3 },
      ]);

      await expect(getFirstVisibleMyWorkChapterGroups(USER)).resolves.toEqual(
        new Map([[1, [{ bookId: 1, chapterNumber: 3 }]]]),
      );
    });

    it('lists an Observer review chapter only with a verified grant and membership', async () => {
      await insertAssignment(db, {
        id: 4,
        unit: 30,
        chapter: 1,
        status: 'linguist_check',
      });
      await insertAssignment(db, {
        id: 5,
        unit: 20,
        chapter: 2,
        status: 'linguist_check',
      });

      // Review stage alone, or a grant without membership, is not access.
      await expect(getFirstVisibleMyWorkChapterGroups(USER)).resolves.toEqual(
        new Map([[1, [{ bookId: 1, chapterNumber: 3 }]]]),
      );
      await expect(
        getFirstVisibleMyWorkChapterGroups(USER, { grantProjectIds: [300] }),
      ).resolves.toEqual(new Map([[1, [{ bookId: 1, chapterNumber: 3 }]]]));

      await expect(
        getFirstVisibleMyWorkChapterGroups(USER, { grantProjectIds: [200] }),
      ).resolves.toEqual(new Map([[1, [{ bookId: 1, chapterNumber: 2 }]]]));
    });

    it("keeps the drafter's chapter while its stage change is queued", async () => {
      await db.execute(
        `INSERT INTO stage_advance_queue (
          chapter_assignment_id, user_id, from_status, to_status, sync_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          1,
          USER,
          'draft',
          'community_review',
          'pending',
          '2024-01-01T00:00:00.000Z',
        ],
      );

      await expect(getFirstVisibleMyWorkChapterGroups(USER)).resolves.toEqual(
        new Map([[1, [{ bookId: 1, chapterNumber: 1 }]]]),
      );
    });

    it('is empty when Home lists nothing', async () => {
      await expect(getFirstVisibleMyWorkChapterGroups(999)).resolves.toEqual(
        new Map(),
      );
    });
  },
);
