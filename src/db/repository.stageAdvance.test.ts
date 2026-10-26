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
    if (sql.includes('peer_checker_id = ?')) {
      const [status, submittedTime, updatedAt, peerCheckerId, id] = params as [
        string,
        string,
        string,
        number,
        number,
      ];
      const row = rows.find(r => r.id === id);
      if (row) {
        row.status = status;
        row.submitted_time = submittedTime;
        row.updated_at = updatedAt;
        row.peer_checker_id = peerCheckerId;
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
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'peer_check', undefined, 4);

    expect(db.__rows[0]).toEqual(
      expect.objectContaining({
        status: 'peer_check',
        peer_checker_id: 20,
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
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'community_review', 99, 4);

    expect(db.__rows[0]).toEqual(
      expect.objectContaining({
        status: 'community_review',
        peer_checker_id: 99,
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

  it('updates locally but does not enqueue when current status is missing', async () => {
    const db = createStageAdvanceTestDb([
      {
        id: 7,
        status: '',
        peer_checker_id: null,
        submitted_time: null,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    setDatabase(db as never);

    await updateChapterAssignmentStatusLocally(7, 'peer_check', undefined, 9);

    expect(db.__rows[0].status).toBe('peer_check');
    expect(db.__queue).toEqual([]);
  });
});

describe('setChapterAssignmentStatus', () => {
  it('writes the resolved status inside a transaction', async () => {
    const rows = [{ id: 7, status: 'community_review', updated_at: '' }];
    const execute = async (query: string, params: unknown[] = []) => {
      const sql = query.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('UPDATE chapter_assignments SET status')) {
        const [status, updatedAt, id] = params as [string, string, number];
        const row = rows.find(item => item.id === id);
        if (row) {
          row.status = status;
          row.updated_at = updatedAt;
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
  });
});
