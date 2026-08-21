import { getDatabase } from '../db';
import { logger } from '@/utils/logger';
import { Transaction } from '@op-engineering/op-sqlite';

const log = logger.create('ChapterClaimsRepository');

export type ChapterAssignmentForClaim = {
  chapterAssignmentId: number;
  assignedUserId: number | null;
};

export async function getChapterAssignmentById(
  chapterAssignmentId: number,
): Promise<ChapterAssignmentForClaim | null> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT id AS chapter_assignment_id, assigned_user_id
     FROM chapter_assignments
     WHERE id = ?`,
    [chapterAssignmentId],
  );
  const row = result.rows?.[0] as
    | { chapter_assignment_id: number; assigned_user_id: number | null }
    | undefined;
  if (!row) return null;
  return {
    chapterAssignmentId: Number(row.chapter_assignment_id),
    assignedUserId:
      row.assigned_user_id === null || row.assigned_user_id === undefined
        ? null
        : Number(row.assigned_user_id),
  };
}

export async function claimChapterOffline(
  chapterAssignmentId: number,
  userId: number,
): Promise<boolean> {
  const db = getDatabase();
  const target = await getChapterAssignmentById(chapterAssignmentId);
  if (!target) {
    log.info('No chapter assignment found for claim', {
      chapterAssignmentId,
    });
    return false;
  }
  if (target.assignedUserId !== null) {
    return false;
  }

  const claimedAt = new Date().toISOString();
  let claimed = false;
  await db.transaction(async (tx: Transaction) => {
    const updateResult = await tx.execute(
      `UPDATE chapter_assignments
       SET assigned_user_id = ?
       WHERE id = ? AND assigned_user_id IS NULL`,
      [userId, target.chapterAssignmentId],
    );
    if ((updateResult.rowsAffected ?? 0) !== 1) {
      return;
    }
    await tx.execute(
      `INSERT INTO chapter_claim_queue
        (chapter_assignment_id, user_id, claimed_at, sync_status)
       VALUES (?, ?, ?, 'pending')`,
      [target.chapterAssignmentId, userId, claimedAt],
    );
    claimed = true;
  });
  if (claimed) {
    log.info('Enqueued offline chapter claim', {
      chapterAssignmentId: target.chapterAssignmentId,
      userId,
    });
  }
  return claimed;
}
