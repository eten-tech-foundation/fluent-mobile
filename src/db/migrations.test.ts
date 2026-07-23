import type { DB, QueryResult, Transaction } from '@op-engineering/op-sqlite';
import {
  addColumnIfMissing,
  columnExists,
  CURRENT_SCHEMA_VERSION,
  getUserVersion,
  Migration,
  rebuildTable,
  restoreChapterAssignmentAssignedUserIntegrity,
  restoreUserProjectsUserIntegrity,
  runMigrations,
  setUserVersion,
} from './migrations';
import { createTableQueries } from './schema';

type Row = Record<string, string | number | null>;

type FakeTable = {
  columns: Set<string>;
  rows: Row[];
  /** Column → referenced table (simple FK tracking for unit tests). */
  foreignKeys: Map<string, string>;
  /** Column → default expression string when present. */
  defaults: Map<string, string>;
};

function emptyResult(rows: Row[] = []): QueryResult {
  return {
    rowsAffected: 0,
    rows: rows as QueryResult['rows'],
  };
}

/**
 * Minimal SQLite stand-in for migration unit tests (no native op-sqlite).
 * Supports: PRAGMA user_version, PRAGMA table_info, CREATE TABLE,
 * ALTER TABLE ADD COLUMN, INSERT…SELECT (incl. LEFT JOIN users), INSERT VALUES,
 * SELECT, DROP, RENAME, indexes, and basic FK checks on INSERT VALUES.
 */
function createFakeDb(initialVersion = 0) {
  let userVersion = initialVersion;
  const tables = new Map<string, FakeTable>();
  const indexes = new Set<string>();

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
      foreignKeys: new Map(),
      defaults: new Map(),
    });
  };

  const ensureUsers = (ids: number[] = [5]) => {
    if (tables.has('users')) {
      return;
    }
    tables.set('users', {
      columns: new Set(['id', 'email']),
      rows: ids.map(id => ({ id, email: `u${id}@example.com` })),
      foreignKeys: new Map(),
      defaults: new Map(),
    });
  };

  const ensureAssignmentParents = () => {
    if (!tables.has('project_units')) {
      tables.set('project_units', {
        columns: new Set(['id']),
        rows: [{ id: 10 }],
        foreignKeys: new Map(),
        defaults: new Map(),
      });
    }
    if (!tables.has('bibles')) {
      tables.set('bibles', {
        columns: new Set(['id']),
        rows: [{ id: 1 }],
        foreignKeys: new Map(),
        defaults: new Map(),
      });
    }
    if (!tables.has('books')) {
      tables.set('books', {
        columns: new Set(['id']),
        rows: [{ id: 1 }],
        foreignKeys: new Map(),
        defaults: new Map(),
      });
    }
  };

  const ensureProjects = (ids: number[] = [100]) => {
    if (tables.has('projects')) {
      return;
    }
    tables.set('projects', {
      columns: new Set(['id', 'name']),
      rows: ids.map(id => ({ id, name: `Project ${id}` })),
      foreignKeys: new Map(),
      defaults: new Map(),
    });
  };

  /** Old-shape membership table: no user_id FK (pre-#103). */
  const ensureOldUserProjects = () => {
    if (tables.has('user_projects')) {
      return;
    }
    tables.set('user_projects', {
      columns: new Set(['user_id', 'project_id']),
      rows: [
        { user_id: 5, project_id: 100 },
        { user_id: 999, project_id: 100 },
      ],
      foreignKeys: new Map([['project_id', 'projects']]),
      defaults: new Map(),
    });
  };

  const parseCreateTable = (sql: string): void => {
    const match = sql.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*)\)/i,
    );
    if (!match) {
      return;
    }
    const [, name, body] = match;
    if (tables.has(name) && /IF\s+NOT\s+EXISTS/i.test(sql)) {
      return;
    }
    if (tables.has(name)) {
      throw new Error(`table already exists: ${name}`);
    }
    const columns = new Set<string>();
    const foreignKeys = new Map<string, string>();
    const defaults = new Map<string, string>();
    for (const part of body.split(',')) {
      const trimmed = part.trim();
      const col = trimmed.split(/\s+/)[0];
      if (
        col &&
        !/^(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)$/i.test(col) &&
        col !== ')'
      ) {
        const clean = col.replace(/[^a-zA-Z0-9_]/g, '');
        columns.add(clean);
        const fk = trimmed.match(/REFERENCES\s+(\w+)\s*\(/i);
        if (fk) {
          foreignKeys.set(clean, fk[1]);
        }
        const dflt = trimmed.match(/DEFAULT\s+('(?:[^']*)'|\S+)/i);
        if (dflt) {
          defaults.set(clean, dflt[1].replace(/^'|'$/g, ''));
        }
      }
    }
    tables.set(name, { columns, rows: [], foreignKeys, defaults });
  };

  const assertForeignKeys = (tableName: string, row: Row): void => {
    const table = tables.get(tableName);
    if (!table) {
      return;
    }
    for (const [column, refTable] of table.foreignKeys) {
      const value = row[column];
      if (value === null || value === undefined) {
        continue;
      }
      const ref = tables.get(refTable);
      if (!ref || !ref.rows.some(r => r.id === value)) {
        throw new Error(
          `FOREIGN KEY constraint failed: ${tableName}.${column} → ${refTable}(${value})`,
        );
      }
    }
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
            dflt_value: table.defaults.get(name) ?? null,
            pk: 0,
          })),
        );
      }

      if (/^CREATE\s+TABLE/i.test(sql)) {
        parseCreateTable(sql);
        return emptyResult();
      }

      const createIndex = sql.match(
        /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,
      );
      if (createIndex) {
        indexes.add(createIndex[1]);
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

      const insertSelectJoinUsers = sql.match(
        /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*SELECT[\s\S]+FROM\s+(\w+)\s+\w+\s+(LEFT|INNER)\s+JOIN\s+users/i,
      );
      if (insertSelectJoinUsers) {
        const [, dest, destCols, src, joinType] = insertSelectJoinUsers;
        const source = tables.get(src);
        const target = tables.get(dest);
        const users = tables.get('users');
        const projects = tables.get('projects');
        if (!source || !target) {
          throw new Error('missing table for copy');
        }
        const cols = destCols.split(',').map(c => c.trim());
        const userIds = new Set((users?.rows ?? []).map(r => r.id));
        const projectIds = new Set((projects?.rows ?? []).map(r => r.id));
        const requiresProject =
          /INNER\s+JOIN\s+projects/i.test(sql) && cols.includes('project_id');
        const isInner = joinType.toUpperCase() === 'INNER';

        target.rows = source.rows
          .map(row => {
            const next: Row = {};
            for (const col of cols) {
              let value = (row[col] as string | number | null) ?? null;
              if (col === 'assigned_user_id' && value !== null) {
                value = userIds.has(value) ? value : null;
              }
              if (col === 'status' && (value === null || value === undefined)) {
                value = 'not_started';
              }
              if (
                (col === 'total_verses' || col === 'completed_verses') &&
                (value === null || value === undefined)
              ) {
                value = 0;
              }
              next[col] = value;
            }
            return next;
          })
          .filter(row => {
            if (isInner && cols.includes('user_id')) {
              const uid = row.user_id;
              if (uid === null || uid === undefined || !userIds.has(uid)) {
                return false;
              }
            }
            if (requiresProject) {
              const pid = row.project_id;
              if (pid === null || pid === undefined || !projectIds.has(pid)) {
                return false;
              }
            }
            return true;
          });
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

      const insertValues = sql.match(
        /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      );
      if (insertValues) {
        const [, tableName, colList, valueList] = insertValues;
        const table = tables.get(tableName);
        if (!table) {
          throw new Error(`no such table: ${tableName}`);
        }
        const cols = colList.split(',').map(c => c.trim());
        const values = valueList.split(',').map(v => {
          const trimmed = v.trim();
          if (trimmed === 'NULL') {
            return null;
          }
          if (/^'.*'$/.test(trimmed)) {
            return trimmed.slice(1, -1);
          }
          const num = Number(trimmed);
          return Number.isNaN(num) ? trimmed : num;
        });
        const row: Row = {};
        cols.forEach((col, index) => {
          row[col] = values[index] ?? null;
        });
        assertForeignKeys(tableName, row);
        table.rows.push(row);
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

      if (/^SELECT\s+\*\s+FROM\s+user_projects/i.test(sql)) {
        ensureOldUserProjects();
        return emptyResult(tables.get('user_projects')!.rows);
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
    _indexes: indexes,
    _seedOldChapterAssignments: ensureChapterAssignmentsOldShape,
    _seedOldUserProjects: ensureOldUserProjects,
    _seedUsers: ensureUsers,
    _seedProjects: ensureProjects,
    _seedAssignmentParents: ensureAssignmentParents,
  };

  return db as unknown as DB & {
    _tables: Map<string, FakeTable>;
    _indexes: Set<string>;
    _seedOldChapterAssignments: () => void;
    _seedOldUserProjects: () => void;
    _seedUsers: (ids?: number[]) => void;
    _seedProjects: (ids?: number[]) => void;
    _seedAssignmentParents: () => void;
  };
}

describe('migrations framework', () => {
  it('applies all migrations from version 0 and sets user_version', async () => {
    const db = createFakeDb(0);
    await runMigrations(db);
    await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
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
    db._seedUsers([5]);
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
    expect(after.rows[0].assigned_user_id).toBe(5);
    expect(db._indexes.has('idx_ca_assigned_user')).toBe(true);
    expect(
      db._tables
        .get('chapter_assignments')!
        .foreignKeys.get('assigned_user_id'),
    ).toBe('users');
    expect(db._tables.get('chapter_assignments')!.defaults.get('status')).toBe(
      'not_started',
    );
    await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
  });

  it('nulls orphan assigned_user_id values during the integrity rebuild', async () => {
    const db = createFakeDb(2);
    db._seedUsers([5]);
    db._seedOldChapterAssignments();
    db._tables.get('chapter_assignments')!.rows[0].assigned_user_id = 999;

    await restoreChapterAssignmentAssignedUserIntegrity(db);

    const rows = db._tables.get('chapter_assignments')!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].assigned_user_id).toBeNull();
    expect(db._indexes.has('idx_ca_assigned_user')).toBe(true);
  });

  it('rejects INSERT that violates assigned_user_id FK after rebuild', async () => {
    const db = createFakeDb(2);
    db._seedUsers([5]);
    db._seedAssignmentParents();
    db._seedOldChapterAssignments();

    await restoreChapterAssignmentAssignedUserIntegrity(db);

    await expect(
      db.execute(
        `INSERT INTO chapter_assignments (id, project_unit_id, bible_id, book_id, chapter_number, assigned_user_id, status, updated_at)
         VALUES (2, 10, 1, 1, 2, 999, 'not_started', '2024-01-02')`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    await expect(
      db.execute(
        `INSERT INTO chapter_assignments (id, project_unit_id, bible_id, book_id, chapter_number, assigned_user_id, status, updated_at)
         VALUES (3, 10, 1, 1, 3, 5, 'not_started', '2024-01-02')`,
      ),
    ).resolves.toBeDefined();
  });

  it('upgrades an old-shape user_projects table without losing valid rows', async () => {
    const db = createFakeDb(3);
    db._seedUsers([5]);
    db._seedProjects([100]);
    db._seedOldUserProjects();

    const before = await db.execute('SELECT * FROM user_projects');
    expect(before.rows).toHaveLength(2);
    expect(
      db._tables.get('user_projects')!.foreignKeys.get('user_id'),
    ).toBeUndefined();

    await runMigrations(db);

    const after = db._tables.get('user_projects')!;
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].user_id).toBe(5);
    expect(after.rows[0].project_id).toBe(100);
    expect(after.foreignKeys.get('user_id')).toBe('users');
    expect(after.foreignKeys.get('project_id')).toBe('projects');
    expect(db._indexes.has('idx_up_user')).toBe(true);
    await expect(getUserVersion(db)).resolves.toBe(CURRENT_SCHEMA_VERSION);
  });

  it('drops orphan user_projects rows during the integrity rebuild', async () => {
    const db = createFakeDb(3);
    db._seedUsers([5]);
    db._seedProjects([100]);
    db._seedOldUserProjects();

    await restoreUserProjectsUserIntegrity(db);

    const rows = db._tables.get('user_projects')!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(5);
    expect(rows.some(r => r.user_id === 999)).toBe(false);
  });

  it('rejects INSERT that violates user_projects.user_id FK after rebuild', async () => {
    const db = createFakeDb(3);
    db._seedUsers([5]);
    db._seedProjects([100, 101]);
    db._seedOldUserProjects();

    await restoreUserProjectsUserIntegrity(db);

    await expect(
      db.execute(
        `INSERT INTO user_projects (user_id, project_id) VALUES (999, 100)`,
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    await expect(
      db.execute(
        `INSERT INTO user_projects (user_id, project_id) VALUES (5, 101)`,
      ),
    ).resolves.toBeDefined();
  });

  it('baseline createTableQueries includes user_projects.user_id FK', () => {
    const userProjectsSql = createTableQueries.find(q =>
      q.includes('CREATE TABLE IF NOT EXISTS user_projects'),
    );
    expect(userProjectsSql).toBeDefined();
    expect(userProjectsSql).toMatch(
      /user_id\s+INTEGER\s+NOT\s+NULL\s+REFERENCES\s+users\s*\(\s*id\s*\)/i,
    );
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
    expect(db._indexes.has('idx_ca_status')).toBe(true);
  });

  it('setUserVersion and getUserVersion round-trip', async () => {
    const db = createFakeDb(0);
    await setUserVersion(db, 7);
    await expect(getUserVersion(db)).resolves.toBe(7);
  });
});

describe('recordings linkage (#99)', () => {
  it('keeps bible_text_id as the canonical recordings link in schema SQL', () => {
    const recordingsSql = createTableQueries.find(q =>
      q.includes('CREATE TABLE IF NOT EXISTS recordings'),
    );
    expect(recordingsSql).toBeDefined();
    expect(recordingsSql).toContain('bible_text_id');
    expect(recordingsSql).not.toContain('chapter_assignment_id');
  });
});

describe('recordings attribution migration (#105)', () => {
  it('includes recorded_by_user_id in baseline recordings schema', () => {
    const recordingsSql = createTableQueries.find(q =>
      q.includes('CREATE TABLE IF NOT EXISTS recordings'),
    );
    expect(recordingsSql).toBeDefined();
    expect(recordingsSql).toContain('recorded_by_user_id');
    expect(recordingsSql).toContain('REFERENCES users(id)');
  });

  it('adds recorded_by_user_id when upgrading from v4', async () => {
    const old = createFakeDb(4);
    old._tables.set('recordings', {
      columns: new Set([
        'id',
        'bible_text_id',
        'local_file_path',
        'blob_key',
        'duration_ms',
        'file_size_bytes',
        'take_number',
        'is_latest',
        'sync_status',
        'upload_error',
        'created_at',
        'updated_at',
      ]),
      rows: [],
      foreignKeys: new Map(),
      defaults: new Map(),
    });

    await runMigrations(old);
    expect(await columnExists(old, 'recordings', 'recorded_by_user_id')).toBe(
      true,
    );
    expect(old._indexes.has('idx_rec_verse_user')).toBe(true);
    await expect(getUserVersion(old)).resolves.toBe(CURRENT_SCHEMA_VERSION);
  });
});
