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
import { getHomeBookSummaries } from './queries';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const canUseRealSqlite = isNodeSqliteAvailable();
const ME = 5;
const RAVI = 6;

/** Milestone 10 has Genesis 1–2; milestone 11 has no chapters yet. */
async function seed(db: DB): Promise<void> {
  for (const id of [ME, RAVI]) {
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
  await db.execute(
    `INSERT INTO projects (
      id, name, source_language_id, target_language_id, is_active, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [100, 'Project', 1, 1, true, 'not_assigned', '2024-01-01'],
  );
  await db.execute(
    'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
    [10, 100, 'not_started', 'Torah'],
  );
  await db.execute(
    'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
    [11, 100, 'not_started', 'Later'],
  );
  await db.execute(
    'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
    [ME, 100],
  );
  for (const chapter of [1, 2]) {
    await db.execute(
      `INSERT INTO chapter_assignments (
        id, project_unit_id, bible_id, book_id, chapter_number, status,
        assigned_user_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [chapter, 10, 1, 1, chapter, 'not_started', ME, '2024-01-01'],
    );
    await db.execute(
      `INSERT INTO bible_texts (id, bible_id, book_id, chapter_number, verse_number, text)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [900 + chapter, 1, 1, chapter, 1, 'In the beginning'],
    );
  }
}

async function record(
  db: DB,
  id: string,
  opts: { verse: number; by: number; status: string },
): Promise<void> {
  await db.execute(
    `INSERT INTO recordings (
      id, bible_text_id, recorded_by_user_id, project_unit_id, local_file_path,
      is_selected, sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id,
      opts.verse,
      opts.by,
      10,
      `/tmp/${id}.m4a`,
      opts.status,
      '2024-01-01',
      '2024-01-01',
    ],
  );
}

(canUseRealSqlite ? describe : describe.skip)(
  'home books against real SQLite',
  () => {
    let db: DB;

    beforeEach(async () => {
      db = createRealSqliteDb();
      await runMigrations(db);
      setDatabase(db);
      await seed(db);
    });

    afterEach(() => {
      db.close();
    });

    it('lists a milestone with no chapters yet, after the books', async () => {
      const books = await getHomeBookSummaries(ME);

      expect(books.map(b => b.key)).toEqual(['10:1', '11:empty']);
      expect(books[1]).toMatchObject({
        bookId: null,
        firstChapterId: null,
        bookName: 'Later',
        milestoneName: 'Later',
        totalChapters: 0,
      });
    });

    it('counts a not-started chapter with takes as recorded', async () => {
      await record(db, 'a', { verse: 901, by: ME, status: 'uploaded' });

      const [genesis] = await getHomeBookSummaries(ME);

      expect(genesis).toMatchObject({
        totalChapters: 2,
        recordedChapters: 1,
        pendingUploads: 0,
      });
    });

    it('counts only my selected takes still waiting to upload', async () => {
      await record(db, 'a', { verse: 901, by: ME, status: 'pending' });
      await record(db, 'b', { verse: 902, by: ME, status: 'failed' });
      await record(db, 'c', { verse: 902, by: ME, status: 'conflicted' });
      await record(db, 'd', { verse: 902, by: RAVI, status: 'pending' });

      const [genesis] = await getHomeBookSummaries(ME);

      expect(genesis).toMatchObject({
        recordedChapters: 2,
        pendingUploads: 2,
      });
    });
  },
);
