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
import { ensureUserProjectMembership } from './repository';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

async function seed(db: DB): Promise<void> {
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
  for (const id of [100, 200]) {
    await db.execute(
      `INSERT INTO projects (
        id, name, source_language_id, target_language_id, is_active, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, `Project ${id}`, 1, 1, true, 'not_assigned', '2024-01-01'],
    );
    await db.execute(
      'INSERT INTO project_units (id, project_id, status, name) VALUES (?, ?, ?, ?)',
      [id / 10, id, 'not_started', ''],
    );
  }
}

async function membershipCount(db: DB): Promise<number> {
  const result = await db.execute(
    'SELECT COUNT(*) AS count FROM user_projects WHERE user_id = 5',
  );
  return Number(result.rows?.[0]?.count);
}

describeReal('ensureUserProjectMembership (real SQLite)', () => {
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

  it('resolves to the stored count when membership is present', async () => {
    for (const projectId of [100, 200]) {
      await db.execute(
        'INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)',
        [5, projectId],
      );
    }

    await expect(ensureUserProjectMembership(5)).resolves.toBe(2);
    expect(await membershipCount(db)).toBe(2);
  });

  it('resolves to 0 when there is nothing to backfill', async () => {
    await expect(ensureUserProjectMembership(5)).resolves.toBe(0);
    expect(await membershipCount(db)).toBe(0);
  });

  it('resolves to null after a backfill, so the caller counts again', async () => {
    await db.execute(
      `INSERT INTO chapter_assignments (
        id, project_unit_id, bible_id, book_id, chapter_number, status,
        assigned_user_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 20, 1, 1, 1, 'not_started', 5, '2024-01-01'],
    );

    await expect(ensureUserProjectMembership(5)).resolves.toBeNull();
    expect(await membershipCount(db)).toBe(1);
  });
});
