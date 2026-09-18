interface ProjectUnitRow {
  id: number;
  project_id: number;
  status: string;
  name: string;
}

interface UserProjectRow {
  user_id: number;
  project_id: number;
}

interface PendingUploadUnit {
  project_unit_id: number;
}

let projectUnitRows: ProjectUnitRow[] = [];
let userProjectRows: UserProjectRow[] = [];
let pendingUploadUnits: PendingUploadUnit[] = [];
const executedSql: string[] = [];

function resetProjectUnitsDbMock(): void {
  projectUnitRows = [];
  userProjectRows = [];
  pendingUploadUnits = [];
  executedSql.length = 0;
}

type ExecuteResult = { rows: unknown[]; rowsAffected?: number };

async function mockExecute(
  sql: string,
  params: unknown[] = [],
): Promise<ExecuteResult> {
  executedSql.push(sql);
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (
    normalized.startsWith('INSERT OR IGNORE INTO project_units') &&
    normalized.includes('name')
  ) {
    const [id, projectId, status, name] = params as [
      number,
      number,
      string,
      string,
    ];
    if (!projectUnitRows.some(row => row.id === id)) {
      projectUnitRows.push({ id, project_id: projectId, status, name });
    }
    return { rows: [] };
  }

  if (normalized.startsWith('UPDATE project_units SET project_id = ?')) {
    const [projectId, id] = params as [number, number];
    const row = projectUnitRows.find(unit => unit.id === id);
    if (row) row.project_id = projectId;
    return { rows: [] };
  }

  if (normalized.startsWith('UPDATE project_units SET name = ?')) {
    const [name, id] = params as [string, number];
    const row = projectUnitRows.find(unit => unit.id === id);
    if (row) row.name = name;
    return { rows: [] };
  }

  if (
    normalized.startsWith('DELETE FROM project_units') &&
    normalized.includes('NOT IN')
  ) {
    const userId = params[0] as number;
    const keepIds = new Set(params.slice(1) as number[]);
    const memberProjectIds = new Set(
      userProjectRows
        .filter(row => row.user_id === userId)
        .map(row => row.project_id),
    );
    const pendingIds = new Set(
      pendingUploadUnits.map(row => row.project_unit_id),
    );
    const before = projectUnitRows.length;
    projectUnitRows = projectUnitRows.filter(row => {
      const isMemberUnit = memberProjectIds.has(row.project_id);
      const isStale = isMemberUnit && !keepIds.has(row.id);
      const hasPendingUpload = pendingIds.has(row.id);
      return !(isStale && !hasPendingUpload);
    });
    return { rows: [], rowsAffected: before - projectUnitRows.length };
  }

  if (
    normalized.startsWith('DELETE FROM project_units') &&
    !normalized.includes('NOT IN')
  ) {
    const userId = params[0] as number;
    const memberProjectIds = new Set(
      userProjectRows
        .filter(row => row.user_id === userId)
        .map(row => row.project_id),
    );
    const pendingIds = new Set(
      pendingUploadUnits.map(row => row.project_unit_id),
    );
    const before = projectUnitRows.length;
    projectUnitRows = projectUnitRows.filter(row => {
      const isMemberUnit = memberProjectIds.has(row.project_id);
      const hasPendingUpload = pendingIds.has(row.id);
      return !(isMemberUnit && !hasPendingUpload);
    });
    return { rows: [], rowsAffected: before - projectUnitRows.length };
  }

  throw new Error(`Unhandled SQL in project units mock: ${normalized}`);
}

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
    transaction: async (
      fn: (tx: { execute: typeof mockExecute }) => Promise<void>,
    ) => {
      await fn({ execute: mockExecute });
    },
  }),
}));

import { reconcileUserMilestones, upsertProjectUnits } from './repository';

describe('upsertProjectUnits', () => {
  beforeEach(() => {
    resetProjectUnitsDbMock();
    projectUnitRows = [
      { id: 10, project_id: 1, status: 'not_started', name: 'Mark' },
    ];
  });

  it('overwrites the stored name when the API sends an empty string', async () => {
    await upsertProjectUnits([{ id: 10, projectId: 1, name: '' }]);

    expect(projectUnitRows).toEqual([
      { id: 10, project_id: 1, status: 'not_started', name: '' },
    ]);
    expect(
      executedSql.some(sql =>
        sql.includes('UPDATE project_units SET name = ?'),
      ),
    ).toBe(true);
  });
});

describe('reconcileUserMilestones', () => {
  beforeEach(() => {
    resetProjectUnitsDbMock();
    userProjectRows = [
      { user_id: 1, project_id: 100 },
      { user_id: 2, project_id: 100 },
    ];
    projectUnitRows = [
      { id: 10, project_id: 100, status: 'not_started', name: 'Mark' },
      { id: 11, project_id: 100, status: 'not_started', name: 'Luke' },
      { id: 20, project_id: 200, status: 'not_started', name: 'Other' },
    ];
  });

  it('removes member project units missing from the current server list', async () => {
    await reconcileUserMilestones(1, [10]);

    expect(projectUnitRows.map(row => row.id)).toEqual([10, 20]);
  });

  it('keeps units with pending uploads even when they are absent from the server list', async () => {
    pendingUploadUnits = [{ project_unit_id: 11 }];

    await reconcileUserMilestones(1, [10]);

    expect(projectUnitRows.map(row => row.id)).toEqual([10, 11, 20]);
  });

  it('clears all member units for the user when the server list is empty', async () => {
    await reconcileUserMilestones(1, []);

    expect(projectUnitRows.map(row => row.id)).toEqual([20]);
  });
});
