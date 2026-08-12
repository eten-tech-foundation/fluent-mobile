import type { Transaction } from '@op-engineering/op-sqlite';
import type { ChapterAssignment } from '../types/db/types';
import {
  filterAssignmentsWithValidParents,
  insertChapterAssignmentSyncData,
  resolveProjectUnitsForSync,
  type ChapterAssignmentParentContext,
} from './repository';
import { setDatabase } from './db';
import { createTableQueries } from './schema';

type Row = Record<string, string | number | null>;

type FakeTable = {
  columns: Set<string>;
  rows: Row[];
  foreignKeys: Map<string, string>;
};

function parseCreateTable(sql: string, tables: Map<string, FakeTable>): void {
  const match = sql.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*)\)/i,
  );
  if (!match) return;
  const [, name, body] = match;
  if (tables.has(name) && /IF\s+NOT\s+EXISTS/i.test(sql)) return;

  const columns = new Set<string>();
  const foreignKeys = new Map<string, string>();
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
      if (fk) foreignKeys.set(clean, fk[1]);
    }
  }
  tables.set(name, { columns, rows: [], foreignKeys });
}

function assertForeignKeys(
  tableName: string,
  row: Row,
  tables: Map<string, FakeTable>,
): void {
  const table = tables.get(tableName);
  if (!table) return;

  for (const [column, refTable] of table.foreignKeys) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    const ref = tables.get(refTable);
    if (!ref || !ref.rows.some(r => r.id === value)) {
      throw new Error(
        `FOREIGN KEY constraint failed: ${tableName}.${column} → ${refTable}(${value})`,
      );
    }
  }
}

function createSyncTestDb() {
  const tables = new Map<string, FakeTable>();

  for (const sql of createTableQueries) {
    if (/^CREATE\s+TABLE/i.test(sql.trim())) {
      parseCreateTable(sql, tables);
    }
  }

  const upsertById = (tableName: string, row: Row, idCol = 'id') => {
    const table = tables.get(tableName);
    if (!table) throw new Error(`no such table: ${tableName}`);
    assertForeignKeys(tableName, row, tables);
    const id = row[idCol];
    const index = table.rows.findIndex(r => r[idCol] === id);
    if (index >= 0) {
      table.rows[index] = { ...table.rows[index], ...row };
    } else {
      table.rows.push(row);
    }
  };

  const executor = {
    execute: async (query: string, params: unknown[] = []) => {
      const sql = query.replace(/\s+/g, ' ').trim();

      if (/^SELECT id FROM users WHERE id IN/i.test(sql)) {
        const users = tables.get('users')?.rows ?? [];
        const allowed = new Set(params.map(Number));
        return {
          rows: users.filter(r => allowed.has(Number(r.id))),
          rowsAffected: 0,
        };
      }

      if (/^SELECT id FROM projects$/i.test(sql)) {
        return { rows: tables.get('projects')?.rows ?? [], rowsAffected: 0 };
      }

      if (/^SELECT id FROM bibles$/i.test(sql)) {
        return { rows: tables.get('bibles')?.rows ?? [], rowsAffected: 0 };
      }

      if (/^SELECT id FROM books$/i.test(sql)) {
        return { rows: tables.get('books')?.rows ?? [], rowsAffected: 0 };
      }

      if (/^SELECT id, project_id FROM project_units$/i.test(sql)) {
        return {
          rows: tables.get('project_units')?.rows ?? [],
          rowsAffected: 0,
        };
      }

      if (/^INSERT OR IGNORE INTO project_units/i.test(sql)) {
        const [id, projectId, status] = params;
        const table = tables.get('project_units')!;
        if (!table.rows.some(r => r.id === id)) {
          const row = {
            id: id as number,
            project_id: projectId as number,
            status: status as string,
          };
          assertForeignKeys('project_units', row, tables);
          table.rows.push(row);
        }
        return { rows: [], rowsAffected: 1 };
      }

      if (/^UPDATE project_units SET project_id/i.test(sql)) {
        const [projectId, id] = params;
        const table = tables.get('project_units')!;
        const row = table.rows.find(r => r.id === id);
        if (row) {
          row.project_id = projectId as number;
          assertForeignKeys('project_units', row, tables);
        }
        return { rows: [], rowsAffected: 1 };
      }

      if (/^INSERT INTO chapter_assignments/i.test(sql)) {
        const row: Row = {
          id: params[0] as number,
          project_unit_id: params[1] as number,
          bible_id: params[2] as number,
          book_id: params[3] as number,
          chapter_number: params[4] as number,
          assigned_user_id: params[5] as number | null,
          peer_checker_id: params[6] as number | null,
          status: params[7] as string,
          submitted_time: params[8] as string | null,
          updated_at: params[9] as string,
          total_verses: params[10] as number,
          completed_verses: params[11] as number,
        };
        upsertById('chapter_assignments', row);
        return { rows: [], rowsAffected: 1 };
      }

      throw new Error(`Unhandled SQL in sync test db: ${sql}`);
    },
  };

  const db = {
    execute: executor.execute,
    transaction: async (fn: (tx: Transaction) => Promise<void>) => {
      await fn(executor as unknown as Transaction);
    },
    seed(row: {
      projects?: Row[];
      bibles?: Row[];
      books?: Row[];
      project_units?: Row[];
      users?: Row[];
    }) {
      for (const [table, rows] of Object.entries(row)) {
        const t = tables.get(table);
        if (t) t.rows.push(...rows);
      }
    },
    table(name: string) {
      return tables.get(name)?.rows ?? [];
    },
  };

  return db;
}

const baseContext = (): ChapterAssignmentParentContext => ({
  knownProjectIds: new Set([100]),
  knownBibleIds: new Set([4]),
  knownBookIds: new Set([12]),
  knownProjectUnitIds: new Set([10]),
  projectUnitToProjectId: new Map([[10, 100]]),
});

const validAssignment = (
  overrides: Partial<ChapterAssignment> = {},
): ChapterAssignment => ({
  chapterAssignmentId: 1,
  projectUnitId: 10,
  projectId: 100,
  bibleId: 4,
  bookId: 12,
  chapterNumber: 1,
  ...overrides,
});

describe('resolveProjectUnitsForSync', () => {
  it('includes units when projectId exists locally', () => {
    const units = resolveProjectUnitsForSync(
      [validAssignment()],
      baseContext().knownProjectIds,
      baseContext().projectUnitToProjectId,
    );
    expect(units.get(10)).toEqual({ id: 10, projectId: 100 });
  });

  it('resolves projectId from existing project_units when payload omits it', () => {
    const units = resolveProjectUnitsForSync(
      [validAssignment({ projectId: 0 })],
      baseContext().knownProjectIds,
      baseContext().projectUnitToProjectId,
    );
    expect(units.get(10)).toEqual({ id: 10, projectId: 100 });
  });

  it('skips units when project is not local', () => {
    const units = resolveProjectUnitsForSync(
      [validAssignment({ projectId: 999 })],
      baseContext().knownProjectIds,
      new Map(),
    );
    expect(units.size).toBe(0);
  });
});

describe('filterAssignmentsWithValidParents', () => {
  it('keeps assignments with resolvable parents', () => {
    const ctx = baseContext();
    const units = resolveProjectUnitsForSync(
      [validAssignment()],
      ctx.knownProjectIds,
      ctx.projectUnitToProjectId,
    );
    const filtered = filterAssignmentsWithValidParents(
      [validAssignment()],
      ctx,
      units,
    );
    expect(filtered).toHaveLength(1);
  });

  it('drops assignments referencing missing bible_id', () => {
    const ctx = baseContext();
    const units = resolveProjectUnitsForSync(
      [validAssignment({ bibleId: 999 })],
      ctx.knownProjectIds,
      ctx.projectUnitToProjectId,
    );
    const filtered = filterAssignmentsWithValidParents(
      [validAssignment({ bibleId: 999 })],
      ctx,
      units,
    );
    expect(filtered).toHaveLength(0);
  });

  it('drops assignments when project unit cannot be resolved', () => {
    const ctx = baseContext();
    const filtered = filterAssignmentsWithValidParents(
      [validAssignment({ projectUnitId: 99, projectId: 999 })],
      ctx,
      new Map(),
    );
    expect(filtered).toHaveLength(0);
  });
});

describe('insertChapterAssignmentSyncData', () => {
  it('does not throw on empty assignments array', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);

    await expect(insertChapterAssignmentSyncData([])).resolves.toBeUndefined();

    expect(db.table('chapter_assignments')).toHaveLength(0);
    expect(db.table('project_units')).toHaveLength(0);
  });

  it('does not throw when assignment references missing bible_id', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
    });

    await expect(
      insertChapterAssignmentSyncData([
        validAssignment({ chapterAssignmentId: 5, bibleId: 999 }),
      ]),
    ).resolves.toBeUndefined();

    expect(db.table('chapter_assignments')).toHaveLength(0);
  });

  it('does not throw when assignment references missing book_id', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
    });

    await expect(
      insertChapterAssignmentSyncData([
        validAssignment({ chapterAssignmentId: 6, bookId: 999 }),
      ]),
    ).resolves.toBeUndefined();

    expect(db.table('chapter_assignments')).toHaveLength(0);
  });

  it('inserts assignment when FK parents exist', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
      users: [{ id: 1, email: 'u@example.com' }],
    });

    await insertChapterAssignmentSyncData([
      validAssignment({
        chapterAssignmentId: 5,
        assignedUserId: 999,
      }),
    ]);

    expect(db.table('chapter_assignments')).toHaveLength(1);
    expect(db.table('chapter_assignments')[0].assigned_user_id).toBeNull();
  });

  it('inserts assignment and upserts missing project unit from payload', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
    });

    await insertChapterAssignmentSyncData([
      validAssignment({ chapterAssignmentId: 7 }),
    ]);

    expect(db.table('project_units')).toHaveLength(1);
    expect(db.table('chapter_assignments')).toHaveLength(1);
  });
});
