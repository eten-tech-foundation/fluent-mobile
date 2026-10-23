import { setDatabase } from './db';
import {
  setChapterAssignmentStatus,
  updateChapterAssignmentStatusLocally,
} from './repository';

type ChapterAssignmentRow = {
  id: number;
  status: string;
  peer_checker_id: number | null;
  submitted_time: string | null;
  updated_at: string;
  stage_entered_at: string | null;
};

type QueueRow = {
  chapter_assignment_id: number;
  user_id: number;
  from_status: string;
  to_status: string;
  peer_checker_id: number | null;
};

function createStageAdvanceTestDb(initial: ChapterAssignmentRow[]) {
  const rows = [...initial];
  const queue: QueueRow[] = [];

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('SELECT status FROM chapter_assignments')) {
      const id = Number(params[0]);
      const row = rows.find(item => item.id === id);
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
    if (
      sql.startsWith('UPDATE chapter_assignments') &&
      sql.includes('stage_entered_at') &&
      sql.includes('IS DISTINCT FROM') &&
      !sql.includes('submitted_time')
    ) {
      const [status, updatedAt, statusAgain, id] = params as [
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
    return { rows: [] };
  };

  return {
    execute,
    transaction: async (
      fn: (tx: { execute: typeof execute }) => Promise<void>,
    ) => {
      await fn({ execute });
    },
    __rows: rows,
    __queue: queue,
  };
}

describe('updateChapterAssignmentStatusLocally', () => {
  it('updates status without clearing peer_checker_id', async () => {
    const db = createStageAdvanceTestDb([
      {
        id: 7,
        status: 'draft',
        peer_checker_id: 20,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
        stage_entered_at: '2025-04-01T15:30:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'peer_check', undefined, 4);

    expect(db.__rows[0]).toEqual(
      expect.objectContaining({
        status: 'peer_check',
        peer_checker_id: 20,
        stage_entered_at: null,
      }),
    );
  });

  it('sets peer_checker_id when assigning on Community Review advance', async () => {
    const db = createStageAdvanceTestDb([
      {
        id: 7,
        status: 'peer_check',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
        stage_entered_at: '2025-04-01T15:30:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'community_review', 99, 4);

    expect(db.__rows[0]).toEqual(
      expect.objectContaining({
        status: 'community_review',
        peer_checker_id: 99,
        stage_entered_at: null,
      }),
    );
    expect(db.__queue).toEqual([
      {
        chapter_assignment_id: 7,
        user_id: 4,
        from_status: 'peer_check',
        to_status: 'community_review',
        peer_checker_id: 99,
      },
    ]);
  });

  it('enqueues from=draft to=peer_check in the same transaction', async () => {
    const db = createStageAdvanceTestDb([
      {
        id: 7,
        status: 'draft',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
        stage_entered_at: null,
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'peer_check', undefined, 9);

    expect(db.__rows[0].status).toBe('peer_check');
    expect(db.__queue).toEqual([
      {
        chapter_assignment_id: 7,
        user_id: 9,
        from_status: 'draft',
        to_status: 'peer_check',
        peer_checker_id: null,
      },
    ]);
  });

  it('clears stage_entered_at on status change and preserves it on repeat', async () => {
    const stamp = '2025-04-01T15:30:00.000Z';
    const db = createStageAdvanceTestDb([
      {
        id: 7,
        status: 'draft',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
        stage_entered_at: stamp,
      },
      {
        id: 8,
        status: 'draft',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
        stage_entered_at: '2025-05-01T15:30:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'peer_check', undefined, 4);
    expect(db.__rows[0].stage_entered_at).toBeNull();
    expect(db.__rows[1].stage_entered_at).toBe('2025-05-01T15:30:00.000Z');

    db.__rows[0].stage_entered_at = '2025-07-01T00:00:00.000Z';
    await updateChapterAssignmentStatusLocally(7, 'peer_check', undefined, 4);
    expect(db.__rows[0].stage_entered_at).toBe('2025-07-01T00:00:00.000Z');
    expect(db.__queue.map(entry => entry.user_id)).toEqual([4, 4]);
  });
});

describe('setChapterAssignmentStatus', () => {
  it('writes the resolved status inside a transaction', async () => {
    const rows = [
      {
        id: 7,
        status: 'community_review',
        updated_at: '',
        stage_entered_at: '2025-04-01T15:30:00.000Z' as string | null,
      },
    ];
    const execute = async (query: string, params: unknown[] = []) => {
      const sql = query.replace(/\s+/g, ' ').trim();
      if (
        sql.startsWith('UPDATE chapter_assignments') &&
        sql.includes('stage_entered_at') &&
        sql.includes('IS DISTINCT FROM')
      ) {
        const [status, updatedAt, statusAgain, id] = params as [
          string,
          string,
          string,
          number,
        ];
        expect(statusAgain).toBe(status);
        const row = rows.find(item => item.id === id);
        if (row) {
          const statusChanged = row.status !== status;
          row.status = status;
          row.updated_at = updatedAt;
          if (statusChanged) {
            row.stage_entered_at = null;
          }
        }
        return { rows: [] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    };
    setDatabase({
      execute: async () => {
        throw new Error('write outside transaction');
      },
      transaction: async (
        fn: (tx: { execute: typeof execute }) => Promise<void>,
      ) => {
        await fn({ execute });
      },
    } as never);

    await setChapterAssignmentStatus(7, 'peer_check');

    expect(rows[0].status).toBe('peer_check');
    expect(rows[0].updated_at).not.toBe('');
    expect(rows[0].stage_entered_at).toBeNull();
  });

  it('clears stage_entered_at only when the resolved status changes', async () => {
    const rows = [
      {
        id: 7,
        status: 'peer_check',
        updated_at: 'old',
        stage_entered_at: '2025-04-01T15:30:00.000Z' as string | null,
      },
      {
        id: 8,
        status: 'draft',
        updated_at: 'old',
        stage_entered_at: '2025-05-01T15:30:00.000Z' as string | null,
      },
    ];
    const execute = async (query: string, params: unknown[] = []) => {
      const sql = query.replace(/\s+/g, ' ').trim();
      if (
        sql.startsWith('UPDATE chapter_assignments') &&
        sql.includes('stage_entered_at') &&
        sql.includes('IS DISTINCT FROM')
      ) {
        const [status, updatedAt, statusAgain, id] = params as [
          string,
          string,
          string,
          number,
        ];
        expect(statusAgain).toBe(status);
        const row = rows.find(item => item.id === id);
        if (row) {
          const statusChanged = row.status !== status;
          row.status = status;
          row.updated_at = updatedAt;
          if (statusChanged) {
            row.stage_entered_at = null;
          }
        }
        return { rows: [] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    };
    setDatabase({
      execute: async () => {
        throw new Error('write outside transaction');
      },
      transaction: async (
        fn: (tx: { execute: typeof execute }) => Promise<void>,
      ) => {
        await fn({ execute });
      },
    } as never);

    await setChapterAssignmentStatus(7, 'peer_check');
    expect(rows[0].stage_entered_at).toBe('2025-04-01T15:30:00.000Z');
    expect(rows[1].stage_entered_at).toBe('2025-05-01T15:30:00.000Z');

    await setChapterAssignmentStatus(7, 'community_review');
    expect(rows[0].stage_entered_at).toBeNull();
    expect(rows[1].stage_entered_at).toBe('2025-05-01T15:30:00.000Z');
  });
});
