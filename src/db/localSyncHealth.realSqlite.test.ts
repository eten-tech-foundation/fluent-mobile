jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

let mockUserId = '7';
jest.mock('../services/storage', () => ({
  getUserIdSync: () => mockUserId,
  getActiveUserId: () => mockUserId,
}));

import type { DB } from '@op-engineering/op-sqlite';
import { renderHook, waitFor } from '@testing-library/react-native';
import {
  resetLocalSyncHealthForTests,
  useLocalSyncHealth,
} from '../hooks/useLocalSyncHealth';
import { setDatabase } from './db';
import { runMigrations } from './migrations';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

const isMissingTextCount = (sql: unknown) =>
  String(sql).includes('bible_text_absences');

/** One chapter with no text yet, in a project `member` belongs to. */
async function fixtureDb(member = 7): Promise<DB> {
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
  `);
  await db.execute(
    'INSERT INTO user_projects(user_id, project_id) VALUES (?, 1)',
    [member],
  );
  return db;
}

async function writeCount(db: DB): Promise<number> {
  const result = await db.execute('SELECT total_changes() AS changes');
  return Number(result.rows?.[0]?.changes);
}

async function mountChecked() {
  const hook = renderHook(() => useLocalSyncHealth());
  await waitFor(() => expect(hook.result.current.checking).toBe(false));
  return hook;
}

describeReal('useLocalSyncHealth reuse (real SQLite)', () => {
  let db: DB;
  let execute: jest.SpyInstance;
  let realExecute: DB['execute'];

  const countReads = () =>
    execute.mock.calls.filter(([sql]) => isMissingTextCount(sql)).length;

  function use(next: DB) {
    execute?.mockRestore();
    db = next;
    setDatabase(db);
    realExecute = db.execute.bind(db);
    execute = jest.spyOn(db, 'execute');
  }

  /** The next missing-text count answers now but is delivered on release. */
  function holdNextCount() {
    let release!: () => void;
    let armed = true;
    execute.mockImplementation((sql: string, params?: unknown[]) => {
      const result = realExecute(sql, params as never);
      if (!armed || !isMissingTextCount(sql)) return result;
      armed = false;
      return new Promise(res => {
        release = () => res(result);
      });
    });
    return () => release();
  }

  beforeEach(async () => {
    resetLocalSyncHealthForTests();
    mockUserId = '7';
    use(await fixtureDb());
  });

  afterEach(async () => {
    execute.mockRestore();
    await db.close();
  });

  it("never reuses another database's check with the same write count", async () => {
    const first = await mountChecked();
    expect(first.result.current.missingTextChapters).toBe(1);
    first.unmount();
    const previous = db;
    const replacement = await fixtureDb(8);
    expect(await writeCount(replacement)).toBe(await writeCount(previous));
    use(replacement);

    const { result } = await mountChecked();

    expect(result.current.missingTextChapters).toBe(0);
    expect(countReads()).toBe(1);
    await previous.close();
  });

  it('reads again after text saved while the count was out', async () => {
    const release = holdNextCount();
    const first = renderHook(() => useLocalSyncHealth());
    await waitFor(() => expect(countReads()).toBe(1));
    await realExecute(
      `INSERT INTO bible_texts(id, bible_id, book_id, chapter_number, verse_number, text)
         VALUES (1, 1, 40, 1, 1, 'Fixture')`,
    );
    release();
    await waitFor(() => expect(first.result.current.checking).toBe(false));
    expect(first.result.current.missingTextChapters).toBe(1);
    first.unmount();

    const { result } = await mountChecked();

    expect(result.current.missingTextChapters).toBe(0);
    expect(countReads()).toBe(2);
  });

  it("does not show the old account's check after a switch", async () => {
    const release = holdNextCount();
    const older = renderHook(() => useLocalSyncHealth());
    await waitFor(() => expect(countReads()).toBe(1));
    mockUserId = '8';
    const newer = await mountChecked();
    expect(newer.result.current.missingTextChapters).toBe(0);
    expect(countReads()).toBe(2);

    release();
    await waitFor(() => expect(older.result.current.checking).toBe(false));
    older.unmount();
    newer.unmount();

    const { result } = await mountChecked();

    expect(result.current.missingTextChapters).toBe(0);
  });
});
