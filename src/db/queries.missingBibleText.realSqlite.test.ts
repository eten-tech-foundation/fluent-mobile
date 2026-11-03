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
import { countChaptersMissingBibleText } from './queries';
import { getChaptersToSync, getMyWorkChaptersToSync } from './repository';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const canUseRealSqlite = isNodeSqliteAvailable();

/** One project unit, one bible, three chapters of Genesis for user 5. */
async function seedCatalogue(db: DB): Promise<void> {
  await db.execute('INSERT INTO users (id, email) VALUES (?, ?)', [
    5,
    'u5@example.com',
  ]);
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
  await db.execute(
    `INSERT INTO projects (
      id, name, source_language_id, target_language_id, is_active, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [100, 'Project', 1, 1, true, 'not_assigned', '2024-01-01'],
  );
  await db.execute(
    'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
    [10, 100, 'not_started', ''],
  );
  await db.execute(
    'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
    [5, 100],
  );
  for (const chapter of [1, 2, 3]) {
    await db.execute(
      `INSERT INTO chapter_assignments (
        id, project_unit_id, bible_id, book_id, chapter_number, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [chapter, 10, 1, 1, chapter, 'not_started', '2024-01-01'],
    );
  }
  // Chapter 2 is also the user's own My Work assignment.
  await db.execute(
    'UPDATE chapter_assignments SET assigned_user_id = ? WHERE id = ?',
    [5, 2],
  );
  // Chapter 1 has text; 2 and 3 do not.
  await db.execute(
    `INSERT INTO bible_texts (id, bible_id, book_id, chapter_number, verse_number, text)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [900, 1, 1, 1, 1, 'In the beginning'],
  );
}

(canUseRealSqlite ? describe : describe.skip)(
  'missing bible text coverage against real SQLite',
  () => {
    let db: DB;

    beforeEach(async () => {
      db = createRealSqliteDb();
      await runMigrations(db);
      await seedCatalogue(db);
      setDatabase(db);
    });

    afterEach(async () => {
      await db.close();
    });

    it('counts only chapters whose text a sync could still fetch', async () => {
      await expect(countChaptersMissingBibleText([5])).resolves.toBe(2);

      await db.execute(
        `INSERT INTO bible_text_absences (bible_id, book_id, chapter_number, recorded_at)
         VALUES (?, ?, ?, ?)`,
        [1, 1, 3, '2024-01-01T00:00:00.000Z'],
      );

      // Chapter 3 is known absent from this bible, so only chapter 2 is left.
      await expect(countChaptersMissingBibleText([5])).resolves.toBe(1);
    });

    it('counts nothing for a user with no projects', async () => {
      await expect(countChaptersMissingBibleText([999])).resolves.toBe(0);
      await expect(countChaptersMissingBibleText([])).resolves.toBe(0);
    });

    it('stops requesting a chapter once it is recorded absent', async () => {
      await db.execute(
        `INSERT INTO bible_text_absences (bible_id, book_id, chapter_number, recorded_at)
         VALUES (?, ?, ?, ?)`,
        [1, 1, 2, '2024-01-01T00:00:00.000Z'],
      );

      const groups = await getChaptersToSync([5]);

      expect(groups.get(1)).toEqual([
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 3 },
      ]);
    });

    it('still re-probes an absent chapter on a scoped My Work pass', async () => {
      await db.execute(
        `INSERT INTO bible_text_absences (bible_id, book_id, chapter_number, recorded_at)
         VALUES (?, ?, ?, ?)`,
        [1, 1, 2, '2024-01-01T00:00:00.000Z'],
      );

      // A server-side fix reaches the user through their own chapters.
      const groups = await getMyWorkChaptersToSync(5);

      expect(groups.get(1)).toEqual([{ bookId: 1, chapterNumber: 2 }]);
    });
  },
);
