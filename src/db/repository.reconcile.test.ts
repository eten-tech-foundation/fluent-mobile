import type { ChapterAssignmentRow } from '../types/db/types';

interface UserProjectRow {
  user_id: number;
  project_id: number;
}

let userProjectRows: UserProjectRow[] = [];
let chapterAssignmentRows: ChapterAssignmentRow[] = [];

function resetReconcileDbMock(): void {
  userProjectRows = [];
  chapterAssignmentRows = [];
}

type ExecuteResult = { rows: unknown[]; rowsAffected?: number };

async function mockExecute(
  sql: string,
  params: unknown[] = [],
): Promise<ExecuteResult> {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  if (
    normalized.startsWith('DELETE FROM user_projects') &&
    normalized.includes('NOT IN')
  ) {
    const userId = params[0] as number;
    const keepIds = new Set(params.slice(1) as number[]);
    const before = userProjectRows.length;
    userProjectRows = userProjectRows.filter(
      r => !(r.user_id === userId && !keepIds.has(r.project_id)),
    );
    return { rows: [], rowsAffected: before - userProjectRows.length };
  }

  if (
    normalized.startsWith('DELETE FROM user_projects WHERE user_id = ?') &&
    !normalized.includes('NOT IN')
  ) {
    const userId = params[0] as number;
    const before = userProjectRows.length;
    userProjectRows = userProjectRows.filter(r => r.user_id !== userId);
    return { rows: [], rowsAffected: before - userProjectRows.length };
  }

  if (
    normalized.startsWith(
      'UPDATE chapter_assignments SET assigned_user_id = NULL',
    ) &&
    normalized.includes('NOT IN')
  ) {
    const userId = params[0] as number;
    const keepIds = new Set(params.slice(1) as number[]);
    let count = 0;
    chapterAssignmentRows = chapterAssignmentRows.map(r => {
      if (r.assigned_user_id === userId && !keepIds.has(r.id)) {
        count += 1;
        return { ...r, assigned_user_id: undefined };
      }
      return r;
    });
    return { rows: [], rowsAffected: count };
  }

  if (
    normalized.startsWith(
      'UPDATE chapter_assignments SET assigned_user_id = NULL WHERE assigned_user_id = ?',
    )
  ) {
    const userId = params[0] as number;
    let count = 0;
    chapterAssignmentRows = chapterAssignmentRows.map(r => {
      if (r.assigned_user_id === userId) {
        count += 1;
        return { ...r, assigned_user_id: undefined };
      }
      return r;
    });
    return { rows: [], rowsAffected: count };
  }

  if (
    normalized.startsWith(
      'UPDATE chapter_assignments SET peer_checker_id = NULL',
    ) &&
    normalized.includes('NOT IN')
  ) {
    const userId = params[0] as number;
    const keepIds = new Set(params.slice(1) as number[]);
    let count = 0;
    chapterAssignmentRows = chapterAssignmentRows.map(r => {
      if (r.peer_checker_id === userId && !keepIds.has(r.id)) {
        count += 1;
        return { ...r, peer_checker_id: undefined };
      }
      return r;
    });
    return { rows: [], rowsAffected: count };
  }

  if (
    normalized.startsWith(
      'UPDATE chapter_assignments SET peer_checker_id = NULL WHERE peer_checker_id = ?',
    )
  ) {
    const userId = params[0] as number;
    let count = 0;
    chapterAssignmentRows = chapterAssignmentRows.map(r => {
      if (r.peer_checker_id === userId) {
        count += 1;
        return { ...r, peer_checker_id: undefined };
      }
      return r;
    });
    return { rows: [], rowsAffected: count };
  }

  if (
    normalized.startsWith(
      'SELECT COUNT(*) as count FROM user_projects WHERE user_id = ? AND project_id = ?',
    )
  ) {
    const [userId, projectId] = params as [number, number];
    const count = userProjectRows.filter(
      r => r.user_id === userId && r.project_id === projectId,
    ).length;
    return { rows: [{ count }] };
  }

  throw new Error(`Unhandled SQL in reconcile mock: ${normalized}`);
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

import {
  reconcileUserProjects,
  reconcileUserChapterWork,
  isUserProjectMember,
} from './repository';

function makeAssignment(
  overrides: Partial<ChapterAssignmentRow>,
): ChapterAssignmentRow {
  return {
    id: 1,
    project_unit_id: 1,
    project_id: 1,
    bible_id: 1,
    book_id: 1,
    chapter_number: 1,
    status: 'draft',
    ...overrides,
  };
}

describe('reconcileUserProjects', () => {
  beforeEach(() => {
    resetReconcileDbMock();
    userProjectRows = [
      { user_id: 1, project_id: 10 },
      { user_id: 1, project_id: 20 },
      { user_id: 1, project_id: 30 },
      { user_id: 2, project_id: 10 },
    ];
  });

  it('removes local memberships not present in the current server list', async () => {
    await reconcileUserProjects(1, [10, 20]);
    expect(userProjectRows).toEqual([
      { user_id: 1, project_id: 10 },
      { user_id: 1, project_id: 20 },
      { user_id: 2, project_id: 10 },
    ]);
  });

  it('clears all local memberships for the user when the server list is empty', async () => {
    await reconcileUserProjects(1, []);
    expect(userProjectRows).toEqual([{ user_id: 2, project_id: 10 }]);
  });

  it('does not touch other users memberships', async () => {
    await reconcileUserProjects(1, []);
    expect(userProjectRows.some(r => r.user_id === 2)).toBe(true);
  });

  it('is a no-op when the current list already matches local state', async () => {
    await reconcileUserProjects(1, [10, 20, 30]);
    expect(userProjectRows.filter(r => r.user_id === 1)).toHaveLength(3);
  });
});

describe('reconcileUserChapterWork', () => {
  beforeEach(() => {
    resetReconcileDbMock();
    chapterAssignmentRows = [
      makeAssignment({ id: 100, assigned_user_id: 1 }),
      makeAssignment({ id: 101, assigned_user_id: 1 }),
      makeAssignment({ id: 102, peer_checker_id: 1 }),
      makeAssignment({ id: 103, peer_checker_id: 1 }),
    ];
  });

  it('clears assigned_user_id for chapters no longer in the assigned list', async () => {
    await reconcileUserChapterWork(1, [100], [102, 103]);
    expect(
      chapterAssignmentRows.find(r => r.id === 101)?.assigned_user_id,
    ).toBeUndefined();
    expect(
      chapterAssignmentRows.find(r => r.id === 100)?.assigned_user_id,
    ).toBe(1);
  });

  it('clears peer_checker_id for chapters no longer in the peer-check list', async () => {
    await reconcileUserChapterWork(1, [100, 101], [102]);
    expect(
      chapterAssignmentRows.find(r => r.id === 103)?.peer_checker_id,
    ).toBeUndefined();
    expect(chapterAssignmentRows.find(r => r.id === 102)?.peer_checker_id).toBe(
      1,
    );
  });

  it('clears all assigned and peer-check roles when both lists are empty', async () => {
    await reconcileUserChapterWork(1, [], []);
    expect(
      chapterAssignmentRows.every(
        r => r.assigned_user_id !== 1 && r.peer_checker_id !== 1,
      ),
    ).toBe(true);
  });

  it('does not touch other users roles', async () => {
    chapterAssignmentRows.push(
      makeAssignment({ id: 104, assigned_user_id: 2 }),
    );
    await reconcileUserChapterWork(1, [], []);
    expect(
      chapterAssignmentRows.find(r => r.id === 104)?.assigned_user_id,
    ).toBe(2);
  });
});

describe('isUserProjectMember', () => {
  beforeEach(() => {
    resetReconcileDbMock();
    userProjectRows = [{ user_id: 1, project_id: 10 }];
  });

  it('returns true when the user is a member', async () => {
    await expect(isUserProjectMember(1, 10)).resolves.toBe(true);
  });

  it('returns false when the user is not a member', async () => {
    await expect(isUserProjectMember(1, 999)).resolves.toBe(false);
  });

  it('returns false after reconcile removes the membership', async () => {
    await reconcileUserProjects(1, []);
    await expect(isUserProjectMember(1, 10)).resolves.toBe(false);
  });
});
