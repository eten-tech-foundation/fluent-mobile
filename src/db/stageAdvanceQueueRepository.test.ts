import { setDatabase } from './db';
import {
  deleteStageAdvanceQueueEntry,
  enqueueStageAdvance,
  getPendingStageAdvances,
} from './stageAdvanceQueueRepository';

type QueueRow = {
  id: number;
  chapter_assignment_id: number;
  user_id: number;
  from_status: string;
  to_status: string;
  peer_checker_id: number | null;
  created_at: string;
  sync_status: string;
};

function createQueueTestDb() {
  const rows: QueueRow[] = [];
  let nextId = 1;

  const execute = async (query: string, params: unknown[] = []) => {
    const sql = query.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('INSERT INTO stage_advance_queue')) {
      rows.push({
        id: nextId,
        chapter_assignment_id: Number(params[0]),
        user_id: Number(params[1]),
        from_status: String(params[2]),
        to_status: String(params[3]),
        peer_checker_id:
          params[4] === null || params[4] === undefined
            ? null
            : Number(params[4]),
        created_at: String(params[5]),
        sync_status: 'pending',
      });
      nextId += 1;
      return { rows: [], rowsAffected: 1 };
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM stage_advance_queue')) {
      const pending = rows
        .filter(row => row.sync_status === 'pending')
        .sort(
          (a, b) => a.id - b.id || a.created_at.localeCompare(b.created_at),
        );
      return { rows: pending, rowsAffected: 0 };
    }
    if (sql.startsWith('DELETE FROM stage_advance_queue')) {
      const id = Number(params[0]);
      const index = rows.findIndex(row => row.id === id);
      if (index >= 0) rows.splice(index, 1);
      return { rows: [], rowsAffected: index >= 0 ? 1 : 0 };
    }
    throw new Error(`Unhandled SQL in queue test db: ${sql}`);
  };

  return {
    execute,
    transaction: async (
      fn: (tx: { execute: typeof execute }) => Promise<void>,
    ) => {
      await fn({ execute });
    },
    __rows: rows,
  };
}

describe('stageAdvanceQueueRepository', () => {
  it('enqueues a pending row and lists it for that user', async () => {
    const db = createQueueTestDb();
    setDatabase(db as never);

    await enqueueStageAdvance({
      chapterAssignmentId: 7,
      userId: 9,
      fromStatus: 'draft',
      toStatus: 'peer_check',
      peerCheckerId: null,
      createdAt: '2026-10-22T12:00:00.000Z',
    });
    await enqueueStageAdvance({
      chapterAssignmentId: 8,
      userId: 4,
      fromStatus: 'peer_check',
      toStatus: 'community_review',
      peerCheckerId: 99,
      createdAt: '2026-10-22T12:01:00.000Z',
    });

    const pending = await getPendingStageAdvances();
    expect(pending.filter(row => row.userId === 9)).toEqual([
      {
        id: 1,
        chapterAssignmentId: 7,
        userId: 9,
        fromStatus: 'draft',
        toStatus: 'peer_check',
        peerCheckerId: null,
        createdAt: '2026-10-22T12:00:00.000Z',
      },
    ]);
    expect(pending.map(row => row.id)).toEqual([1, 2]);
  });

  it('deletes a queue row', async () => {
    const db = createQueueTestDb();
    setDatabase(db as never);

    await enqueueStageAdvance({
      chapterAssignmentId: 7,
      userId: 9,
      fromStatus: 'draft',
      toStatus: 'peer_check',
    });

    await deleteStageAdvanceQueueEntry(1);

    await expect(getPendingStageAdvances()).resolves.toEqual([]);
    expect(db.__rows).toHaveLength(0);
  });
});
