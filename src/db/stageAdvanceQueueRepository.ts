import type { Scalar, Transaction } from '@op-engineering/op-sqlite';
import { getDatabase } from './db';

type SqlExecutor = {
  execute: (
    query: string,
    params?: Scalar[],
  ) => Promise<{
    rows?: Record<string, unknown>[];
    rowsAffected?: number;
  }>;
};

export type StageAdvanceQueueInput = {
  chapterAssignmentId: number;
  userId: number;
  fromStatus: string;
  toStatus: string;
  peerCheckerId?: number | null;
  createdAt?: string;
};

export type PendingStageAdvance = {
  id: number;
  chapterAssignmentId: number;
  userId: number;
  fromStatus: string;
  toStatus: string;
  peerCheckerId: number | null;
  createdAt: string;
};

export async function insertStageAdvanceQueueEntry(
  executor: SqlExecutor,
  input: StageAdvanceQueueInput,
): Promise<void> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  await executor.execute(
    `DELETE FROM stage_advance_queue
     WHERE chapter_assignment_id = ?
       AND user_id = ?
       AND from_status = ?
       AND to_status = ?
       AND sync_status = 'pending'`,
    [input.chapterAssignmentId, input.userId, input.fromStatus, input.toStatus],
  );
  await executor.execute(
    `INSERT INTO stage_advance_queue
      (chapter_assignment_id, user_id, from_status, to_status, peer_checker_id, created_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [
      input.chapterAssignmentId,
      input.userId,
      input.fromStatus,
      input.toStatus,
      input.peerCheckerId ?? null,
      createdAt,
    ],
  );
}

export async function enqueueStageAdvance(
  input: StageAdvanceQueueInput,
): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    await insertStageAdvanceQueueEntry(tx, input);
  });
}

export async function getPendingStageAdvances(): Promise<
  PendingStageAdvance[]
> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT id, chapter_assignment_id, user_id, from_status, to_status,
            peer_checker_id, created_at
     FROM stage_advance_queue
     WHERE sync_status = 'pending'
     ORDER BY id ASC, created_at ASC`,
  );
  const rows = result.rows ?? [];
  return rows.map(row => ({
    id: Number(row.id),
    chapterAssignmentId: Number(row.chapter_assignment_id),
    userId: Number(row.user_id),
    fromStatus: String(row.from_status),
    toStatus: String(row.to_status),
    peerCheckerId:
      row.peer_checker_id === null || row.peer_checker_id === undefined
        ? null
        : Number(row.peer_checker_id),
    createdAt: String(row.created_at),
  }));
}

export async function deleteStageAdvanceQueueEntry(id: number): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (tx: Transaction) => {
    await tx.execute(`DELETE FROM stage_advance_queue WHERE id = ?`, [id]);
  });
}
