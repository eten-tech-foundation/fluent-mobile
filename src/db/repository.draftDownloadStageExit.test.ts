const mockMaybePurge = jest.fn();
let mockActiveUserId = '7';

jest.mock('../services/draftDownloadPurge', () => ({
  maybePurgeDraftDownloadsAfterPersistedStageChange: (...args: unknown[]) =>
    mockMaybePurge(...args),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => mockActiveUserId,
}));

import { setDatabase } from './db';
import {
  insertChapterAssignmentSyncData,
  updateChapterAssignmentStatusLocally,
} from './repository';

type AssignmentRow = {
  id: number;
  project_unit_id: number;
  status: string;
  peer_checker_id: number | null;
  submitted_time: string | null;
  updated_at: string;
  stage_entered_at?: string | null;
  bible_id?: number;
  book_id?: number;
  chapter_number?: number;
  assigned_user_id?: number | null;
  total_verses?: number;
  completed_verses?: number;
  has_conflict?: number;
};

type QueueRow = {
  chapter_assignment_id: number;
  user_id: number;
  from_status: string;
  to_status: string;
  peer_checker_id: number | null;
  sync_status: string;
};

type StageExitDbOptions = {
  /** Throw on stage snapshot SELECT (cleanup path). */
  failSnapshot?: boolean;
  /** Throw inside txn after writes to simulate rollback. */
  failCommitAfterWrite?: boolean;
  /** Mutate active account when snapshot SELECT runs. */
  switchActiveOnSnapshot?: string;
  /** Change project_id on the unit between before/after snapshots. */
  changeProjectOnAfterSnapshot?: number;
};

function createStageExitTestDb(
  initial: AssignmentRow[],
  options: StageExitDbOptions = {},
) {
  const rows = [...initial];
  const units = [{ id: 10, project_id: 100 }];
  const queue: QueueRow[] = [];
  let snapshotReads = 0;

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();

    if (
      sql.startsWith(
        'SELECT ca.id AS id, ca.status AS status, pu.project_id AS project_id',
      )
    ) {
      snapshotReads += 1;
      if (options.switchActiveOnSnapshot) {
        mockActiveUserId = options.switchActiveOnSnapshot;
      }
      if (options.failSnapshot) {
        throw new Error('snapshot boom');
      }
      if (
        options.changeProjectOnAfterSnapshot !== undefined &&
        snapshotReads >= 2
      ) {
        units[0].project_id = options.changeProjectOnAfterSnapshot;
      }
      const allowed = new Set(params.map(Number));
      return {
        rows: rows
          .filter(r => allowed.has(r.id))
          .map(r => ({
            id: r.id,
            status: r.status,
            project_id: units.find(u => u.id === r.project_unit_id)?.project_id,
          })),
      };
    }

    // #770 local-queue fromStatus read (independent of purge snapshots).
    if (sql.startsWith('SELECT status FROM chapter_assignments WHERE id = ?')) {
      const id = Number(params[0]);
      const row = rows.find(r => r.id === id);
      return { rows: row ? [{ status: row.status }] : [] };
    }

    if (sql.startsWith('INSERT INTO stage_advance_queue')) {
      queue.push({
        chapter_assignment_id: Number(params[0]),
        user_id: Number(params[1]),
        from_status: String(params[2]),
        to_status: String(params[3]),
        peer_checker_id:
          params[4] === null || params[4] === undefined
            ? null
            : Number(params[4]),
        sync_status: 'pending',
      });
      return { rows: [] };
    }

    if (
      sql.includes('peer_checker_id = ?') &&
      sql.includes('stage_entered_at') &&
      sql.includes('IS DISTINCT FROM')
    ) {
      const [status, submittedTime, updatedAt, statusAgain, peerCheckerId, id] =
        params as [string, string, string, string, number, number];
      expect(statusAgain).toBe(status);
      const row = rows.find(r => r.id === id);
      if (row) {
        const statusChanged = row.status !== status;
        row.status = status;
        row.submitted_time = submittedTime;
        row.updated_at = updatedAt;
        row.peer_checker_id = peerCheckerId;
        if (statusChanged) {
          row.stage_entered_at = null;
        }
      }
      return { rows: [] };
    }

    if (
      sql.startsWith('UPDATE chapter_assignments') &&
      sql.includes('submitted_time') &&
      sql.includes('stage_entered_at') &&
      sql.includes('IS DISTINCT FROM')
    ) {
      const [status, submittedTime, updatedAt, statusAgain, id] = params as [
        string,
        string,
        string,
        string,
        number,
      ];
      expect(statusAgain).toBe(status);
      const row = rows.find(r => r.id === id);
      if (row) {
        const statusChanged = row.status !== status;
        row.status = status;
        row.submitted_time = submittedTime;
        row.updated_at = updatedAt;
        if (statusChanged) {
          row.stage_entered_at = null;
        }
      }
      return { rows: [] };
    }

    if (sql.startsWith('UPDATE chapter_assignments SET status = ?')) {
      const [status, submittedTime, updatedAt, id] = params as [
        string,
        string,
        string,
        number,
      ];
      const row = rows.find(r => r.id === id);
      if (row) {
        row.status = status;
        row.submitted_time = submittedTime;
        row.updated_at = updatedAt;
      }
      return { rows: [] };
    }

    if (/^SELECT id FROM users WHERE id IN/i.test(sql)) {
      return { rows: [] };
    }
    if (/^SELECT id FROM projects$/i.test(sql)) {
      return { rows: [{ id: 100 }, { id: 200 }] };
    }
    if (/^SELECT id FROM bibles$/i.test(sql)) {
      return { rows: [{ id: 4 }] };
    }
    if (/^SELECT id FROM books$/i.test(sql)) {
      return { rows: [{ id: 12 }] };
    }
    if (/^SELECT id, project_id FROM project_units$/i.test(sql)) {
      return { rows: units };
    }
    if (/^INSERT OR IGNORE INTO users/i.test(sql)) {
      return { rows: [] };
    }
    if (/^INSERT OR IGNORE INTO project_units/i.test(sql)) {
      return { rows: [] };
    }
    if (/^UPDATE project_units SET/i.test(sql)) {
      return { rows: [] };
    }
    if (/^INSERT INTO chapter_assignments/i.test(sql)) {
      const id = Number(params[0]);
      const existing = rows.find(r => r.id === id);
      const next: AssignmentRow = {
        id,
        project_unit_id: Number(params[1]),
        bible_id: Number(params[2]),
        book_id: Number(params[3]),
        chapter_number: Number(params[4]),
        assigned_user_id: (params[5] as number | null) ?? null,
        peer_checker_id: (params[6] as number | null) ?? null,
        status: String(params[7]),
        submitted_time: (params[8] as string | null) ?? null,
        updated_at: String(params[9]),
        stage_entered_at: (params[10] as string | null) ?? null,
        total_verses: Number(params[11] ?? 0),
        completed_verses: Number(params[12] ?? 0),
        has_conflict: Number(params[13] ?? 0),
      };
      // Mirror #770 pending status/peer_checker preservation in the upsert SQL.
      const preservesQueuedStage =
        /stage_advance_queue/i.test(sql) &&
        /chapter_assignments\.status/i.test(sql);
      if (existing && preservesQueuedStage) {
        const queued = queue.some(
          q =>
            q.chapter_assignment_id === id && q.sync_status === 'pending',
        );
        if (queued) {
          next.status = existing.status;
          next.peer_checker_id = existing.peer_checker_id;
          if (/stage_entered_at/i.test(sql)) {
            next.stage_entered_at = existing.stage_entered_at ?? null;
          }
        }
      }
      if (existing) {
        Object.assign(existing, next);
      } else {
        rows.push(next);
      }
      if (options.failCommitAfterWrite) {
        throw new Error('rollback boom');
      }
      return { rows: [] };
    }

    throw new Error(`Unhandled SQL: ${sql}`);
  };

  return {
    execute,
    transaction: async (
      fn: (tx: { execute: typeof execute }) => Promise<void>,
    ) => {
      await fn({ execute });
    },
    __rows: rows,
    __units: units,
    __queue: queue,
  };
}

describe('repository stage-exit draft download purge hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUserId = '7';
    mockMaybePurge.mockResolvedValue(null);
  });

  it('local advance enqueues fromStatus and purges after commit with actor userId', async () => {
    const db = createStageExitTestDb([
      {
        id: 9,
        project_unit_id: 10,
        status: 'peer_check',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(
      9,
      'community_review',
      undefined,
      7,
    );

    expect(db.__rows[0].status).toBe('community_review');
    expect(db.__queue).toEqual([
      {
        chapter_assignment_id: 9,
        user_id: 7,
        from_status: 'peer_check',
        to_status: 'community_review',
        peer_checker_id: null,
        sync_status: 'pending',
      },
    ]);
    expect(mockMaybePurge).toHaveBeenCalledWith({
      projectId: 100,
      userId: 7,
      chapterAssignmentId: 9,
      fromStatus: 'peer_check',
      toStatus: 'community_review',
    });
  });

  it('keeps sync actor userId when active account switches mid-flight', async () => {
    const db = createStageExitTestDb(
      [
        {
          id: 9,
          project_unit_id: 10,
          status: 'community_review',
          peer_checker_id: null,
          submitted_time: null,
          updated_at: '2026-01-01T00:00:00.000Z',
          bible_id: 4,
          book_id: 12,
          chapter_number: 1,
        },
      ],
      { switchActiveOnSnapshot: '99' },
    );
    setDatabase(db as never);

    await insertChapterAssignmentSyncData(
      [
        {
          chapterAssignmentId: 9,
          projectId: 100,
          projectUnitId: 10,
          bibleId: 4,
          bookId: 12,
          chapterNumber: 1,
          chapterStatus: 'linguist_check',
        },
      ],
      7,
    );

    expect(mockActiveUserId).toBe('99');
    expect(mockMaybePurge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
    );
  });

  it('local advance captures explicit actor before await; mid-flight active switch ignored', async () => {
    const db = createStageExitTestDb(
      [
        {
          id: 9,
          project_unit_id: 10,
          status: 'peer_check',
          peer_checker_id: null,
          submitted_time: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      { switchActiveOnSnapshot: '99' },
    );
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(
      9,
      'community_review',
      undefined,
      7,
    );

    expect(mockActiveUserId).toBe('99');
    expect(db.__queue[0]?.user_id).toBe(7);
    expect(mockMaybePurge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
    );
  });

  it('does not purge when the write transaction rolls back', async () => {
    const db = createStageExitTestDb(
      [
        {
          id: 9,
          project_unit_id: 10,
          status: 'community_review',
          peer_checker_id: null,
          submitted_time: null,
          updated_at: '2026-01-01T00:00:00.000Z',
          bible_id: 4,
          book_id: 12,
          chapter_number: 1,
        },
      ],
      { failCommitAfterWrite: true },
    );
    setDatabase(db as never);

    await expect(
      insertChapterAssignmentSyncData(
        [
          {
            chapterAssignmentId: 9,
            projectId: 100,
            projectUnitId: 10,
            bibleId: 4,
            bookId: 12,
            chapterNumber: 1,
            chapterStatus: 'linguist_check',
          },
        ],
        7,
      ),
    ).rejects.toThrow('rollback boom');
    expect(mockMaybePurge).not.toHaveBeenCalled();
  });

  it('keeps committed status write and queue when snapshot capture fails (no purge)', async () => {
    const db = createStageExitTestDb(
      [
        {
          id: 9,
          project_unit_id: 10,
          status: 'peer_check',
          peer_checker_id: null,
          submitted_time: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      { failSnapshot: true },
    );
    setDatabase(db as never);

    await expect(
      updateChapterAssignmentStatusLocally(9, 'community_review', undefined, 7),
    ).resolves.toBeUndefined();
    expect(db.__rows[0].status).toBe('community_review');
    expect(db.__queue).toEqual([
      expect.objectContaining({
        chapter_assignment_id: 9,
        from_status: 'peer_check',
        to_status: 'community_review',
        user_id: 7,
      }),
    ]);
    expect(mockMaybePurge).not.toHaveBeenCalled();
  });

  it('skips purge when project identity changes across the persisted pair', async () => {
    const db = createStageExitTestDb(
      [
        {
          id: 9,
          project_unit_id: 10,
          status: 'peer_check',
          peer_checker_id: null,
          submitted_time: null,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      { changeProjectOnAfterSnapshot: 200 },
    );
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(
      9,
      'community_review',
      undefined,
      7,
    );

    expect(db.__rows[0].status).toBe('community_review');
    expect(mockMaybePurge).not.toHaveBeenCalled();
  });

  it('local same-status write still reports actual persisted pair (gating is in purge helper)', async () => {
    const db = createStageExitTestDb([
      {
        id: 9,
        project_unit_id: 10,
        status: 'peer_check',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(9, 'peer_check', undefined, 7);

    expect(mockMaybePurge).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: 'peer_check',
        toStatus: 'peer_check',
      }),
    );
  });

  it('pending queue preserves status on sync upsert — purge sees actual same from/to', async () => {
    const db = createStageExitTestDb([
      {
        id: 9,
        project_unit_id: 10,
        status: 'peer_check',
        peer_checker_id: 20,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
        bible_id: 4,
        book_id: 12,
        chapter_number: 1,
        assigned_user_id: 5,
      },
    ]);
    db.__queue.push({
      chapter_assignment_id: 9,
      user_id: 5,
      from_status: 'draft',
      to_status: 'peer_check',
      peer_checker_id: null,
      sync_status: 'pending',
    });
    setDatabase(db as never);

    await insertChapterAssignmentSyncData(
      [
        {
          chapterAssignmentId: 9,
          projectId: 100,
          projectUnitId: 10,
          bibleId: 4,
          bookId: 12,
          chapterNumber: 1,
          chapterStatus: 'draft',
          assignedUserId: 5,
        },
      ],
      7,
    );

    expect(db.__rows[0].status).toBe('peer_check');
    expect(db.__rows[0].peer_checker_id).toBe(20);
    expect(mockMaybePurge).toHaveBeenCalledWith({
      projectId: 100,
      userId: 7,
      chapterAssignmentId: 9,
      fromStatus: 'peer_check',
      toStatus: 'peer_check',
    });
  });

  it('sync upsert compares actual persisted old/new after commit (explicit sync account)', async () => {
    const db = createStageExitTestDb([
      {
        id: 9,
        project_unit_id: 10,
        status: 'community_review',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
        bible_id: 4,
        book_id: 12,
        chapter_number: 1,
      },
    ]);
    setDatabase(db as never);

    await insertChapterAssignmentSyncData(
      [
        {
          chapterAssignmentId: 9,
          projectId: 100,
          projectUnitId: 10,
          bibleId: 4,
          bookId: 12,
          chapterNumber: 1,
          chapterStatus: 'linguist_check',
        },
      ],
      7,
    );

    expect(db.__rows[0].status).toBe('linguist_check');
    expect(mockMaybePurge).toHaveBeenCalledWith({
      projectId: 100,
      userId: 7,
      chapterAssignmentId: 9,
      fromStatus: 'community_review',
      toStatus: 'linguist_check',
    });
  });

  it('does not fail the status write when purge throws', async () => {
    mockMaybePurge.mockRejectedValue(new Error('purge boom'));
    const db = createStageExitTestDb([
      {
        id: 9,
        project_unit_id: 10,
        status: 'peer_check',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await expect(
      updateChapterAssignmentStatusLocally(9, 'community_review', undefined, 7),
    ).resolves.toBeUndefined();
    expect(db.__rows[0].status).toBe('community_review');
    expect(db.__queue).toHaveLength(1);
  });
});
