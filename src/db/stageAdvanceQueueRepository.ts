import { getDatabase } from './db';

export type StageAdvanceQueueItem = {
  id: string;
  chapterAssignmentId: number;
  targetStatus: string;
  queueOrder: number;
  queuedAt: string;
};

type StageAdvanceQueueRow = {
  id: string;
  chapter_assignment_id: number;
  target_status: string;
  queue_order: number;
  queued_at: string;
};

function mapRow(row: StageAdvanceQueueRow): StageAdvanceQueueItem {
  return {
    id: row.id,
    chapterAssignmentId: row.chapter_assignment_id,
    targetStatus: row.target_status,
    queueOrder: row.queue_order,
    queuedAt: row.queued_at,
  };
}

/** Pending advances in queue order (oldest first). */
export async function listPendingStageAdvances(): Promise<
  StageAdvanceQueueItem[]
> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT id, chapter_assignment_id, target_status, queue_order, queued_at
     FROM stage_advance_queue
     ORDER BY queue_order ASC, queued_at ASC`,
  );
  const rows = (result.rows ?? []) as StageAdvanceQueueRow[];
  return rows.map(mapRow);
}

export async function removeStageAdvanceQueueItem(id: string): Promise<void> {
  const db = getDatabase();
  await db.execute(`DELETE FROM stage_advance_queue WHERE id = ?`, [id]);
}
