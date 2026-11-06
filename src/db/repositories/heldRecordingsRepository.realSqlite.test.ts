import type { DB } from '@op-engineering/op-sqlite';
import { createTableQueries } from '../schema';
import {
  createRealSqliteDb,
  isNodeSqliteAvailable,
} from '../../test/realSqlite';

let mockDb: DB;

jest.mock('../db', () => ({
  getDatabase: () => mockDb,
}));

import {
  getHeldRecordings,
  reconcileHeldRecordings,
} from './heldRecordingsRepository';

const canUseRealSqlite = isNodeSqliteAvailable();

async function seed(db: DB): Promise<void> {
  await db.execute('INSERT INTO users (id, email) VALUES (?, ?), (?, ?)', [
    1,
    'drafter@example.com',
    2,
    'peer@example.com',
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
    `INSERT INTO bibles (id, language_id, name, abbreviation)
     VALUES (?, ?, ?, ?)`,
    [1, 1, 'Test Bible', 'TST'],
  );
  await db.execute(
    `INSERT INTO projects (
       id, name, source_language_id, target_language_id, is_active, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [100, 'Alpha', 1, 1, 1, 'not_assigned', '2024-01-01'],
  );
  await db.execute(
    `INSERT INTO projects (
       id, name, source_language_id, target_language_id, is_active, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [200, 'Beta', 1, 1, 1, 'not_assigned', '2024-01-01'],
  );
  await db.execute(
    'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
    [10, 100, 'not_started', ''],
  );
  await db.execute(
    'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
    [20, 200, 'not_started', ''],
  );
  // Only unit 20 has an assignment, so a take with a NULL captured unit can
  // still resolve to its project.
  await db.execute(
    `INSERT INTO chapter_assignments (
       id, project_unit_id, bible_id, book_id, chapter_number, status, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [500, 20, 1, 1, 1, 'draft', '2024-01-01'],
  );
  await db.execute(
    `INSERT INTO bible_texts (
       id, bible_id, book_id, chapter_number, verse_number, text
     ) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
    [1000, 1, 1, 1, 1, 'In the beginning', 1001, 1, 1, 1, 2, 'The earth'],
  );
  // User 1 is a member of Alpha only; user 2 is a member of Beta.
  await db.execute(
    'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
    [1, 100],
  );
  await db.execute(
    'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
    [2, 200],
  );

  const insertRecording = async (args: {
    id: string;
    bibleTextId: number;
    owner: number;
    unit: number | null;
    status: string;
    error?: string | null;
  }): Promise<void> => {
    await db.execute(
      `INSERT INTO recordings (
         id, bible_text_id, recorded_by_user_id, project_unit_id,
         local_file_path, sync_status, upload_error, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.id,
        args.bibleTextId,
        args.owner,
        args.unit,
        `/recordings/${args.id}.m4a`,
        args.status,
        args.error ?? null,
        '2024-01-01',
        '2024-01-01',
      ],
    );
  };

  await insertRecording({
    id: 'alpha-ok',
    bibleTextId: 1000,
    owner: 1,
    unit: 10,
    status: 'pending',
  });
  await insertRecording({
    id: 'beta-pending',
    bibleTextId: 1000,
    owner: 1,
    unit: 20,
    status: 'pending',
  });
  await insertRecording({
    id: 'beta-failed',
    bibleTextId: 1001,
    owner: 1,
    unit: 20,
    status: 'failed',
    error: 'Username not found on project',
  });
  await insertRecording({
    id: 'beta-peer-ok',
    bibleTextId: 1001,
    owner: 2,
    unit: 20,
    status: 'pending',
  });
  await insertRecording({
    id: 'beta-resolved-unit',
    bibleTextId: 1001,
    owner: 1,
    unit: null,
    status: 'pending',
  });
}

async function statusOf(db: DB, id: string): Promise<string> {
  const result = await db.execute(
    'SELECT sync_status, upload_error FROM recordings WHERE id = ?',
    [id],
  );
  return String(result.rows[0]?.sync_status);
}

async function uploadErrorOf(db: DB, id: string): Promise<string | null> {
  const result = await db.execute(
    'SELECT upload_error FROM recordings WHERE id = ?',
    [id],
  );
  const value = result.rows[0]?.upload_error;
  return value === null || value === undefined ? null : String(value);
}

(canUseRealSqlite ? describe : describe.skip)('held recordings (#855)', () => {
  beforeEach(async () => {
    mockDb = createRealSqliteDb();
    for (const query of createTableQueries) {
      await mockDb.execute(query);
    }
    await seed(mockDb);
  });

  afterEach(async () => {
    await mockDb.close();
  });

  it('holds takes for projects the recording account left and keeps member work pending', async () => {
    await reconcileHeldRecordings(1);

    await expect(statusOf(mockDb, 'alpha-ok')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');
    await expect(statusOf(mockDb, 'beta-failed')).resolves.toBe('held');
    await expect(statusOf(mockDb, 'beta-peer-ok')).resolves.toBe('pending');
    // NULL captured unit resolves through the chapter's only assignment.
    await expect(statusOf(mockDb, 'beta-resolved-unit')).resolves.toBe('held');
    // A held take is not a failure.
    await expect(uploadErrorOf(mockDb, 'beta-failed')).resolves.toBeNull();
  });

  it('lists held takes for the active account grouped-ready for the Sync page', async () => {
    await reconcileHeldRecordings(1);

    const records = await getHeldRecordings(1);
    expect(records.map(record => record.id)).toEqual([
      'beta-pending',
      'beta-failed',
      'beta-resolved-unit',
    ]);
    expect(records[0]).toMatchObject({
      projectId: 200,
      projectName: 'Beta',
      bookName: 'Genesis',
      chapterNumber: 1,
      verseNumber: 1,
      localFilePath: '/recordings/beta-pending.m4a',
    });
    // Another account's held/pending work is not shown here.
    await expect(getHeldRecordings(2)).resolves.toEqual([]);
  });

  it('releases held takes once membership returns so the next pass uploads them', async () => {
    await reconcileHeldRecordings(1);
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('held');

    await mockDb.execute(
      'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
      [1, 200],
    );
    await reconcileHeldRecordings(1);

    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-failed')).resolves.toBe('pending');
    await expect(statusOf(mockDb, 'beta-resolved-unit')).resolves.toBe(
      'pending',
    );
    await expect(getHeldRecordings(1)).resolves.toEqual([]);
  });

  it('does nothing without an active account', async () => {
    await expect(reconcileHeldRecordings(null)).resolves.toEqual({
      held: 0,
      released: 0,
    });
    await expect(getHeldRecordings(null)).resolves.toEqual([]);
    await expect(statusOf(mockDb, 'beta-pending')).resolves.toBe('pending');
  });
});
