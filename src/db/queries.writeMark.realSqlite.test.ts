// queries.ts reaches op-sqlite's KV Storage through parseUserId; the real
// driver here is the node:sqlite DB below, not this module.
jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

import { setDatabase } from './db';
import { runMigrations } from './migrations';
import { getDatabaseWriteMark, sameDatabaseWrites } from './queries';
import { createRealSqliteDb, isNodeSqliteAvailable } from '../test/realSqlite';

const describeReal = isNodeSqliteAvailable() ? describe : describe.skip;

describeReal('getDatabaseWriteMark (real SQLite)', () => {
  it('moves on a write or a transaction, and not on reads or no-op inserts', async () => {
    const db = createRealSqliteDb();
    setDatabase(db);
    await runMigrations(db);
    await db.execute(
      'INSERT INTO languages (id, lang_name, script_direction) VALUES (1, ?, ?)',
      ['English', 'ltr'],
    );

    const start = await getDatabaseWriteMark();
    await db.execute('SELECT * FROM languages');
    await db.execute(
      'INSERT OR IGNORE INTO languages (id, lang_name, script_direction) VALUES (1, ?, ?)',
      ['English', 'ltr'],
    );
    expect(sameDatabaseWrites(start, await getDatabaseWriteMark())).toBe(true);

    await db.execute('UPDATE languages SET lang_name = ? WHERE id = 1', [
      'Inglés',
    ]);
    const afterUpdate = await getDatabaseWriteMark();
    expect(sameDatabaseWrites(start, afterUpdate)).toBe(false);

    await db.transaction(async tx => {
      await tx.execute(
        'INSERT INTO books (id, code, eng_display_name) VALUES (1, ?, ?)',
        ['GEN', 'Genesis'],
      );
    });
    expect(sameDatabaseWrites(afterUpdate, await getDatabaseWriteMark())).toBe(
      false,
    );
  });

  it('shares one read within a turn and reads afresh after it', async () => {
    const db = createRealSqliteDb();
    setDatabase(db);
    await runMigrations(db);
    const execute = jest.spyOn(db, 'execute');

    const first = getDatabaseWriteMark();
    const second = getDatabaseWriteMark();
    expect(second).toBe(first);
    const before = await first;

    await db.execute(
      'INSERT INTO languages (id, lang_name, script_direction) VALUES (1, ?, ?)',
      ['English', 'ltr'],
    );
    const after = await getDatabaseWriteMark();

    expect(sameDatabaseWrites(before, after)).toBe(false);
    expect(
      execute.mock.calls.filter(([sql]) => sql.includes('total_changes')),
    ).toHaveLength(2);
  });

  it('never matches a mark from another connection', async () => {
    const first = createRealSqliteDb();
    setDatabase(first);
    const a = await getDatabaseWriteMark();
    setDatabase(createRealSqliteDb());
    const b = await getDatabaseWriteMark();

    expect(a?.changes).toBe(b?.changes);
    expect(sameDatabaseWrites(a, b)).toBe(false);
    expect(sameDatabaseWrites(null, b)).toBe(false);
  });
});
