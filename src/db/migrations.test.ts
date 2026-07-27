import type { DB, QueryResult, Transaction } from '@op-engineering/op-sqlite';
import {
  addColumnIfMissing,
  columnExists,
  getUserVersion,
  Migration,
  rebuildTable,
  runMigrations,
  setUserVersion,
} from './migrations';

type Row = Record<string, string | number | null>;

type FakeTable = {
  columns: Set<string>;
  rows: Row[];
};

function emptyResult(rows: Row[] = []): QueryResult {
  return {
    rowsAffected: 0,
    rows: rows as QueryResult['rows'],
  };
}

/**
 * Minimal SQLite stand-in for migration unit tests (no native op-sqlite).
 * Supports: PRAGMA user_version, PRAGMA table_info, CREATE TABLE IF NOT EXISTS,
 * ALTER TABLE ADD COLUMN, INSERT, SELECT, DROP, RENAME, and no-op indexes.
 */
function createFakeDb(initialVersion = 0) {
  let userVersion = initialVersion;
  const tables = new Map<string, FakeTable>();

  const ensureChapterAssignmentsOldShape = () => {
    if (tables.has('chapter_assignments')) {
      return;
    }
    tables.set('chapter_assignments', {
      columns: new Set([
        'id',
        'project_unit_id',
        'bible_id',
        'book_id',
        'chapter_number',
        'assigned_user_id',
        'status',
        'submitted_time',
        'updated_at',
      ]),
      rows: [
        {
          id: 1,
          project_unit_id: 10,
          bible_id: 1,
          book_id: 1,
          chapter_number: 1,
          assigned_user_id: 5,
          status: 'in_progress',
          submitted_time: null,
          updated_at: '2024-01-01',
        },
      ],
    });
  };

  const parseCreateTable = (sql: string): void => {
    const match = sql.match(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(([\s\S]*)\)/i,
    );
    if (!match) {
      return;
    }
    const [, name, body] = match;
    if (tables.has(name)) {
      return;
    }
    const columns = new Set<string>();
    for (const part of body.split(',')) {
      const col = part.trim().split(/\s+/)[0];
      if (
        col &&
        !/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)$/i.test(col) &&
        col !== ')'
      ) {
        columns.add(col.replace(/[^a-zA-Z0-9_]/g, ''));
      }
    }
    tables.set(name, { columns, rows: [] });
  };

  const executor = {
    execute: async (query: string): Promise<QueryResult> => {
      const sql = query.trim();

      if (/^PRAGMA\s+user_version\s*$/i.test(sql)) {
        return emptyResult([{ user_version: userVersion }]);
      }

      const setVersion = sql.match(/^PRAGMA\s+user_version\s*=\s*(\d+)/i);
      if (setVersion) {
        userVersion = Number(setVersion[1]);
        return emptyResult();
      }

      const tableInfo = sql.match(/^PRAGMA\s+table_info\((\w+)\)/i);
      if (tableInfo) {
        const table = tables.get(tableInfo[1]);
        if (!table) {
          return emptyResult();
        }
        return emptyResult(
          [...table.columns].map((name, index) => ({
            cid: index,
            name,
            type: 'TEXT',
            notnull: 0,
            dflt_value: null,
            pk: 0,
          })),
        );
      }

      if (/^CREATE\s+TABLE/i.test(sql)) {
        parseCreateTable(sql);
        return emptyResult();
      }

      if (/^CREATE\s+INDEX/i.test(sql)) {
        return emptyResult();
      }

      const alter = sql.match(
        /^ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+(.+)$/i,
      );
      if (alter) {
        const [, tableName, columnName] = alter;
        const table = tables.get(tableName);
        if (!table) {
          throw new Error(`no such table: ${tableName}`);
        }
        if (table.columns.has(columnName)) {
          throw new Error(`duplicate column name: ${columnName}`);
        }
        table.columns.add(columnName);
        for (const row of table.rows) {
          row[columnName] = 0;
        }
        return emptyResult();
      }

      const insertSelect = sql.match(
        /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*SELECT\s+(.+)\s+FROM\s+(\w+)/i,
      );
      if (insertSelect) {
        const [, dest, destCols, , src] = insertSelect;
        const source = tables.get(src);
        const target = tables.get(dest);
        if (!source || !target) {
          throw new Error('missing table for copy');
        }
        const cols = destCols.split(',').map(c => c.trim());
        target.rows = source.rows.map(row => {
          const next: Row = {};
          for (const col of cols) {
            next[col] = (row[col] as string | number | null) ?? 0;
          }
          return next;
        });
        return emptyResult();
      }

      const drop = sql.match(/^DROP\s+TABLE\s+(\w+)/i);
      if (drop) {
        tables.delete(drop[1]);
        return emptyResult();
      }

      const rename = sql.match(/^ALTER\s+TABLE\s+(\w+)\s+RENAME\s+TO\s+(\w+)/i);
      if (rename) {
        const [, from, to] = rename;
        const table = tables.get(from);
        if (!table) {
          throw new Error(`no such table: ${from}`);
        }
        tables.delete(from);
        tables.set(to, table);
        return emptyResult();
      }

      if (/^SELECT\s+\*\s+FROM\s+chapter_assignments/i.test(sql)) {
        ensureChapterAssignmentsOldShape();
        return emptyResult(tables.get('chapter_assignments')!.rows);
      }

      // Baseline CREATE statements may include whitespace quirks; ignore unknown DDL in fake.
      if (/^CREATE\s+/i.test(sql) || sql.length === 0) {
        return emptyResult();
      }

      return emptyResult();
    },
  };

  const db = {
    execute: executor.execute,
    transaction: async (fn: (tx: Transaction) => Promise<void>) => {
      await fn(executor as unknown as Transaction);
    },
    _tables: tables,
    _seedOldChapterAssignments: ensureChapterAssignmentsOldShape,
  };

  return db as unknown as DB & {
    _tables: Map<string, FakeTable>;
    _seedOldChapterAssignments: () => void;
  };
}

describe('migrations framework', () => {
  it('applies all migrations from version 0 and sets user_version', async () => {
    const db = createFakeDb(0);
    await runMigrations(db);
    await expect(getUserVersion(db)).resolves.toBe(3);
  });

  it('is idempotent on a second run', async () => {
    const db = createFakeDb(0);
    await runMigrations(db);
    const versionAfterFirst = await getUserVersion(db);

    const applied: number[] = [];
    const spySteps: Migration[] = [
      {
        version: 1,
        name: 'one',
        up: async () => {
          applied.push(1);
        },
      },
      {
        version: 2,
        name: 'two',
        up: async () => {
          applied.push(2);
        },
      },
    ];
    await runMigrations(db, spySteps);
    expect(applied).toEqual([]);
    await expect(getUserVersion(db)).resolves.toBe(versionAfterFirst);
  });

  it('runs only migrations newer than the current user_version', async () => {
    const applied: number[] = [];
    const db = createFakeDb(1);
    await runMigrations(db, [
      {
        version: 1,
        name: 'one',
        up: async () => {
          applied.push(1);
        },
      },
      {
        version: 2,
        name: 'two',
        up: async () => {
          applied.push(2);
        },
      },
    ]);
    expect(applied).toEqual([2]);
    await expect(getUserVersion(db)).resolves.toBe(2);
  });

  it('upgrades an old-shape chapter_assignments table without losing rows', async () => {
    const db = createFakeDb(0);
    db._seedOldChapterAssignments();

    const before = await db.execute('SELECT * FROM chapter_assignments');
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0].id).toBe(1);
    expect(await columnExists(db, 'chapter_assignments', 'total_verses')).toBe(
      false,
    );

    await runMigrations(db);

    expect(await columnExists(db, 'chapter_assignments', 'total_verses')).toBe(
      true,
    );
    expect(
      await columnExists(db, 'chapter_assignments', 'completed_verses'),
    ).toBe(true);
    expect(
      await columnExists(db, 'chapter_assignments', 'peer_checker_id'),
    ).toBe(true);

    const after = await db.execute('SELECT * FROM chapter_assignments');
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].id).toBe(1);
    expect(after.rows[0].status).toBe('in_progress');
    await expect(getUserVersion(db)).resolves.toBe(3);
  });

  it('upgrades an old-shape projects table by adding the metadata column', async () => {
    const db = createFakeDb(0);
    db._tables.set('projects', {
      columns: new Set([
        'id',
        'name',
        'source_language_id',
        'target_language_id',
        'is_active',
        'status',
        'updated_at',
      ]),
      rows: [],
    });

    expect(await columnExists(db, 'projects', 'metadata')).toBe(false);

    await runMigrations(db);

    expect(await columnExists(db, 'projects', 'metadata')).toBe(true);
    await expect(getUserVersion(db)).resolves.toBe(3);
  });

  it('addColumnIfMissing is a no-op when the column already exists', async () => {
    const db = createFakeDb(0);
    db._seedOldChapterAssignments();
    await addColumnIfMissing(
      db,
      'chapter_assignments',
      'total_verses',
      'INTEGER NOT NULL DEFAULT 0',
    );
    await addColumnIfMissing(
      db,
      'chapter_assignments',
      'total_verses',
      'INTEGER NOT NULL DEFAULT 0',
    );
    expect(await columnExists(db, 'chapter_assignments', 'total_verses')).toBe(
      true,
    );
  });

  it('rebuildTable copies rows through create → copy → drop → rename', async () => {
    const db = createFakeDb(0);
    db._seedOldChapterAssignments();

    await rebuildTable(db, {
      tableName: 'chapter_assignments',
      createSql: `CREATE TABLE IF NOT EXISTS chapter_assignments_new (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        total_verses INTEGER NOT NULL DEFAULT 0
      )`,
      copySql: `INSERT INTO chapter_assignments_new (id, status, total_verses)
        SELECT id, status, 0 FROM chapter_assignments`,
      indexes: [
        'CREATE INDEX IF NOT EXISTS idx_ca_status ON chapter_assignments(status)',
      ],
    });

    const table = db._tables.get('chapter_assignments');
    expect(table).toBeDefined();
    expect(table!.columns.has('total_verses')).toBe(true);
    expect(table!.rows).toHaveLength(1);
    expect(table!.rows[0].id).toBe(1);
    expect(table!.rows[0].status).toBe('in_progress');
    expect(db._tables.has('chapter_assignments_new')).toBe(false);
  });

  it('setUserVersion and getUserVersion round-trip', async () => {
    const db = createFakeDb(0);
    await setUserVersion(db, 7);
    await expect(getUserVersion(db)).resolves.toBe(7);
  });
});
