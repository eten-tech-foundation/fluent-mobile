import type { DB } from '@op-engineering/op-sqlite';
import {
  CURRENT_SCHEMA_VERSION,
  getUserVersion,
  migrations,
  runMigrations,
} from './migrations';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const NODE_SQLITE_MISSING_WARNING = [
  '',
  '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
  'SKIPPING real SQLite migration tests: node:sqlite is missing.',
  'These tests require Node >= 22.5 (CI / this repo: >= 24.14.0).',
  'A green fake-db suite is not proof that device schema migrates.',
  '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
  '',
].join('\n');

const canUseRealSqlite = isNodeSqliteAvailable();
if (!canUseRealSqlite) {
  console.warn(NODE_SQLITE_MISSING_WARNING);
}

async function columnNames(db: DB, table: string): Promise<string[]> {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.map(row => String((row as { name: string }).name));
}

async function seedAssignmentGraph(db: DB): Promise<void> {
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
}

(canUseRealSqlite ? describe : describe.skip)(
  'migrations against real SQLite',
  () => {
    let db: DB;

    afterEach(async () => {
      if (db) {
        await db.close();
      }
    });

    it('applies all migrations from version 0 and sets user_version', async () => {
      db = createRealSqliteDb();
      await runMigrations(db);
      await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
    });

    it('upgrades from an older user_version to CURRENT_SCHEMA_VERSION', async () => {
      db = createRealSqliteDb();
      await runMigrations(
        db,
        migrations.filter(step => step.version <= 1),
      );
      await expect(getUserVersion(db)).resolves.toBe(1);

      await runMigrations(db);
      await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
    });

    it('does not re-apply migrations on a second run', async () => {
      db = createRealSqliteDb();
      await runMigrations(db);
      const transaction = jest.spyOn(db, 'transaction');

      await runMigrations(db);

      expect(transaction).not.toHaveBeenCalled();
      await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
    });

    it('exposes key columns via PRAGMA table_info after migrate', async () => {
      db = createRealSqliteDb();
      await runMigrations(db);

      await expect(columnNames(db, 'chapter_assignments')).resolves.toEqual(
        expect.arrayContaining([
          'total_verses',
          'completed_verses',
          'peer_checker_id',
          'has_conflict',
          'assigned_user_id',
        ]),
      );

      const recordings = await columnNames(db, 'recordings');
      expect(recordings).toEqual(
        expect.arrayContaining([
          'is_selected',
          'is_canonical',
          'recorded_by_user_id',
          'version_token',
          'granularity',
          'project_unit_id',
        ]),
      );
      expect(recordings).not.toContain('is_latest');

      await expect(columnNames(db, 'projects')).resolves.toEqual(
        expect.arrayContaining(['metadata', 'pericope_set_id']),
      );
      await expect(columnNames(db, 'project_units')).resolves.toContain('name');
      await expect(columnNames(db, 'download_queue')).resolves.toEqual(
        expect.arrayContaining([
          'resource_id',
          'serialized_content',
          'user_id',
          'book_code',
        ]),
      );
      await expect(columnNames(db, 'pericope_sets')).resolves.toContain('id');
      await expect(columnNames(db, 'pericope_verses')).resolves.toContain(
        'pericope_number',
      );
      await expect(columnNames(db, 'chapter_claim_queue')).resolves.toContain(
        'chapter_assignment_id',
      );
    });

    it('keeps a chapter_assignments row through rebuildTable', async () => {
      db = createRealSqliteDb();
      await runMigrations(
        db,
        migrations.filter(step => step.version <= 3),
      );
      await seedAssignmentGraph(db);
      await db.execute(
        `INSERT INTO chapter_assignments (
          id, project_unit_id, bible_id, book_id, chapter_number,
          assigned_user_id, status, updated_at, total_verses, completed_verses
        ) VALUES (42, 10, 1, 1, 1, 5, 'in_progress', '2024-01-01', 10, 3)`,
      );

      await runMigrations(db);

      const after = await db.execute(
        `SELECT id, status, assigned_user_id, total_verses, completed_verses
         FROM chapter_assignments WHERE id = 42`,
      );
      expect(after.rows).toHaveLength(1);
      expect(after.rows[0]).toEqual(
        expect.objectContaining({
          id: 42,
          status: 'in_progress',
          assigned_user_id: 5,
          total_verses: 10,
          completed_verses: 3,
        }),
      );
      await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
    });
  },
);
