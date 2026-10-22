const mockMaybePurge = jest.fn();

jest.mock('../services/draftDownloadPurge', () => ({
  maybePurgeDraftDownloadsAfterPersistedStageChange: (...args: unknown[]) =>
    mockMaybePurge(...args),
}));

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

      if (
        /^SELECT ca\.id AS id, ca\.status AS status, pu\.project_id AS project_id/i.test(
          sql,
        )
      ) {
        const allowed = new Set(params.map(Number));
        const assignments = tables.get('chapter_assignments')?.rows ?? [];
        const units = tables.get('project_units')?.rows ?? [];
        const rows = assignments
          .filter(r => allowed.has(Number(r.id)))
          .map(r => {
            const unit = units.find(u => u.id === r.project_unit_id);
            return {
              id: r.id,
              status: r.status,
              project_id: unit?.project_id ?? null,
            };
          })
          .filter(r => r.project_id !== null && r.project_id !== undefined);
        return { rows, rowsAffected: 0 };
      }

      if (/^INSERT OR IGNORE INTO users \(id, email\)/i.test(sql)) {
        const [id, email] = params;
        const table = tables.get('users')!;
        if (!table.rows.some(r => r.id === id)) {
          table.rows.push({
            id: id as number,
            username: null,
            email: email as string,
            first_name: null,
            last_name: null,
          });
        }
        return { rows: [], rowsAffected: 1 };
      }

      if (/^INSERT OR IGNORE INTO project_units/i.test(sql)) {
        const [id, projectId, status, name] = params;
        const table = tables.get('project_units')!;
        if (!table.rows.some(r => r.id === id)) {
          const row = {
            id: id as number,
            project_id: projectId as number,
            status: status as string,
            name: (name as string | undefined) ?? '',
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

      if (/^UPDATE project_units SET name/i.test(sql)) {
        const [name, id] = params;
        const table = tables.get('project_units')!;
        const row = table.rows.find(r => r.id === id);
        if (row) {
          row.name = name as string;
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
          stage_entered_at: params[10] as string | null,
          total_verses: params[11] as number,
          completed_verses: params[12] as number,
          has_conflict: params[13] as number,
        };
        const updateHasConflict = Number(params[14] ?? 0) === 1;
        const existing = tables
          .get('chapter_assignments')
          ?.rows.find(r => r.id === row.id);
        if (existing && !updateHasConflict) {
          row.has_conflict = existing.has_conflict ?? 0;
        }
        const preservesQueuedStage =
          /stage_advance_queue/i.test(sql) &&
          /chapter_assignments\.status/i.test(sql);
        if (existing && preservesQueuedStage) {
          const queued = (tables.get('stage_advance_queue')?.rows ?? []).some(
            queuedRow =>
              queuedRow.chapter_assignment_id === row.id &&
              queuedRow.sync_status === 'pending',
          );
          if (queued) {
            row.status = existing.status;
            row.peer_checker_id = existing.peer_checker_id;
            // Only preserve timestamp when the upsert SQL includes the SAQ CASE.
            if (/stage_entered_at/i.test(sql)) {
              row.stage_entered_at = existing.stage_entered_at ?? null;
            }
          }
        }
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
      stage_advance_queue?: Row[];
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

  it('falls back to local project_units when payload projectId is invalid', () => {
    const units = resolveProjectUnitsForSync(
      [validAssignment({ projectId: 999 })],
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybePurge.mockResolvedValue(null);
  });

  it('does not throw on empty assignments array', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);

    await expect(insertChapterAssignmentSyncData([], 7)).resolves.toEqual({
      insertedCount: 0,
      skipped: [],
    });

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
      insertChapterAssignmentSyncData(
        [validAssignment({ chapterAssignmentId: 5, bibleId: 999 })],
        7,
      ),
    ).resolves.toEqual({
      insertedCount: 0,
      skipped: [
        {
          chapterAssignmentId: 5,
          reason: 'missing_bible',
        },
      ],
    });

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
      insertChapterAssignmentSyncData(
        [validAssignment({ chapterAssignmentId: 6, bookId: 999 })],
        7,
      ),
    ).resolves.toEqual({
      insertedCount: 0,
      skipped: [
        {
          chapterAssignmentId: 6,
          reason: 'missing_book',
        },
      ],
    });

    expect(db.table('chapter_assignments')).toHaveLength(0);
  });

  it('does not upsert project unit when assignment is filtered out', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
    });

    await insertChapterAssignmentSyncData(
      [validAssignment({ chapterAssignmentId: 10, bibleId: 999 })],
      7,
    );

    expect(db.table('project_units')).toHaveLength(0);
    expect(db.table('chapter_assignments')).toHaveLength(0);
  });

  it('stubs an unknown assignee and writes assigned_user_id through', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
      users: [{ id: 1, email: 'u@example.com' }],
    });

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 5,
          assignedUserId: 999,
        }),
      ],
      7,
    );

    expect(db.table('chapter_assignments')).toHaveLength(1);
    expect(db.table('chapter_assignments')[0].assigned_user_id).toBe(999);

    const stub = db.table('users').find(u => u.id === 999);
    expect(stub).toBeDefined();
    expect(stub?.email).toBe('stub+999@fluent.local');
  });
  it('stubs an unknown peer checker and writes peer_checker_id through', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
    });

    await insertChapterAssignmentSyncData(
      [validAssignment({ chapterAssignmentId: 8, peerCheckerId: 777 })],
      7,
    );

    expect(db.table('chapter_assignments')[0].peer_checker_id).toBe(777);
    const stub = db.table('users').find(u => u.id === 777);
    expect(stub?.email).toBe('stub+777@fluent.local');
  });

  it('keeps the stored milestone name when assignment sync omits name', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [
        { id: 10, project_id: 100, status: 'not_started', name: 'Mark' },
      ],
    });

    await insertChapterAssignmentSyncData([validAssignment()], 7);

    expect(db.table('project_units')[0].name).toBe('Mark');
  });

  it('inserts assignment and upserts missing project unit from payload', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
    });

    await insertChapterAssignmentSyncData(
      [validAssignment({ chapterAssignmentId: 7 })],
      7,
    );

    expect(db.table('project_units')).toHaveLength(1);
    expect(db.table('chapter_assignments')).toHaveLength(1);
  });

  it('inserts valid rows and skips orphan rows in the same batch', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
    });

    await insertChapterAssignmentSyncData(
      [
        validAssignment({ chapterAssignmentId: 1 }),
        validAssignment({ chapterAssignmentId: 2, bibleId: 999 }),
      ],
      7,
    );

    expect(db.table('chapter_assignments')).toHaveLength(1);
    expect(db.table('chapter_assignments')[0].id).toBe(1);
  });

  it('sets has_conflict when provided and preserves it when omitted', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
    });

    await insertChapterAssignmentSyncData(
      [validAssignment({ chapterAssignmentId: 1, hasConflict: true })],
      7,
    );
    expect(db.table('chapter_assignments')[0].has_conflict).toBe(1);

    await insertChapterAssignmentSyncData(
      [validAssignment({ chapterAssignmentId: 1, chapterStatus: 'draft' })],
      7,
    );
    expect(db.table('chapter_assignments')[0].has_conflict).toBe(1);

    await insertChapterAssignmentSyncData(
      [validAssignment({ chapterAssignmentId: 1, hasConflict: false })],
      7,
    );
    expect(db.table('chapter_assignments')[0].has_conflict).toBe(0);
  });

  it('keeps local status and peer checker while a stage advance is queued', async () => {
    mockMaybePurge.mockResolvedValue(null);
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
      users: [{ id: 5, email: 'seehagen@example.com' }],
    });

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 1,
          chapterStatus: 'peer_check',
          peerCheckerId: 20,
          assignedUserId: 5,
        }),
      ],
      7,
    );
    db.seed({
      stage_advance_queue: [
        {
          id: 1,
          chapter_assignment_id: 1,
          user_id: 5,
          from_status: 'draft',
          to_status: 'peer_check',
          peer_checker_id: null,
          created_at: '2026-10-22T00:00:00.000Z',
          sync_status: 'pending',
        },
      ],
    });
    mockMaybePurge.mockClear();

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 1,
          chapterStatus: 'draft',
          assignedUserId: 5,
        }),
      ],
      7,
    );

    expect(db.table('chapter_assignments')[0].status).toBe('peer_check');
    expect(db.table('chapter_assignments')[0].peer_checker_id).toBe(20);
    // #770 pending skip keeps persisted status — purge sees actual same pair,
    // not the sync payload's draft target.
    expect(mockMaybePurge).toHaveBeenCalledWith({
      projectId: 100,
      userId: 7,
      chapterAssignmentId: 1,
      fromStatus: 'peer_check',
      toStatus: 'peer_check',
    });

    db.table('stage_advance_queue').splice(0, 1);
    mockMaybePurge.mockClear();

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 1,
          chapterStatus: 'draft',
          assignedUserId: 5,
        }),
      ],
      7,
    );

    expect(db.table('chapter_assignments')[0].status).toBe('draft');
    expect(db.table('chapter_assignments')[0].peer_checker_id).toBeNull();
    expect(mockMaybePurge).toHaveBeenCalledWith({
      projectId: 100,
      userId: 7,
      chapterAssignmentId: 1,
      fromStatus: 'peer_check',
      toStatus: 'draft',
    });
  });

  it('persists valid stageEnteredAt and stores null for omitted/invalid', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
    });

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 1,
          stageEnteredAt: '2025-04-01T15:30:00.000Z',
        }),
        validAssignment({
          chapterAssignmentId: 2,
          chapterNumber: 2,
          stageEnteredAt: null,
        }),
        validAssignment({
          chapterAssignmentId: 3,
          chapterNumber: 3,
        }),
        validAssignment({
          chapterAssignmentId: 4,
          chapterNumber: 4,
          stageEnteredAt: 'yesterday',
        }),
      ],
      7,
    );

    const byId = (id: number) =>
      db.table('chapter_assignments').find(row => row.id === id);
    expect(byId(1)?.stage_entered_at).toBe('2025-04-01T15:30:00.000Z');
    expect(byId(2)?.stage_entered_at).toBeNull();
    expect(byId(3)?.stage_entered_at).toBeNull();
    expect(byId(4)?.stage_entered_at).toBeNull();
  });

  it('protects status, peer checker, and stage_entered_at while a stage advance is queued', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
      users: [{ id: 5, email: 'seehagen@example.com' }],
    });

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 1,
          chapterStatus: 'peer_check',
          peerCheckerId: 20,
          assignedUserId: 5,
          stageEnteredAt: '2025-04-01T15:30:00.000Z',
        }),
      ],
      7,
    );
    db.seed({
      stage_advance_queue: [
        {
          id: 1,
          chapter_assignment_id: 1,
          user_id: 5,
          from_status: 'draft',
          to_status: 'peer_check',
          peer_checker_id: null,
          created_at: '2026-10-22T00:00:00.000Z',
          sync_status: 'pending',
        },
      ],
    });

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 1,
          chapterStatus: 'draft',
          assignedUserId: 5,
          peerCheckerId: 99,
          stageEnteredAt: '2026-01-01T00:00:00.000Z',
        }),
      ],
      7,
    );

    expect(db.table('chapter_assignments')[0]).toEqual(
      expect.objectContaining({
        status: 'peer_check',
        peer_checker_id: 20,
        stage_entered_at: '2025-04-01T15:30:00.000Z',
      }),
    );
  });

  it('does not rewrite a peer assignment timestamp when upserting another id', async () => {
    const db = createSyncTestDb();
    setDatabase(db as never);
    db.seed({
      projects: [{ id: 100, name: 'P' }],
      bibles: [{ id: 4, language_id: 1, name: 'B', abbreviation: 'B' }],
      books: [{ id: 12, code: 'GEN', eng_display_name: 'Genesis' }],
      project_units: [{ id: 10, project_id: 100, status: 'not_started' }],
    });

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 1,
          chapterNumber: 1,
          stageEnteredAt: '2025-04-01T15:30:00.000Z',
        }),
        validAssignment({
          chapterAssignmentId: 2,
          chapterNumber: 2,
          stageEnteredAt: '2025-05-01T15:30:00.000Z',
        }),
      ],
      7,
    );

    await insertChapterAssignmentSyncData(
      [
        validAssignment({
          chapterAssignmentId: 2,
          chapterNumber: 2,
          stageEnteredAt: '2025-06-01T15:30:00.000Z',
        }),
      ],
      7,
    );

    const byId = (id: number) =>
      db.table('chapter_assignments').find(row => row.id === id);
    expect(byId(1)?.stage_entered_at).toBe('2025-04-01T15:30:00.000Z');
    expect(byId(2)?.stage_entered_at).toBe('2025-06-01T15:30:00.000Z');
  });
});
