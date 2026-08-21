import { getDatabase } from '../db';
import { logger } from '@/utils/logger';
import { Transaction } from '@op-engineering/op-sqlite';

const log = logger.create('ChapterClaimsRepository');

export type ChapterAssignmentForClaim = {
  chapterAssignmentId: number;
  assignedUserId: number | null;
};

/** Resolve the chapter_assignment row backing a bible_text_id, for claim checks. */
export async function getChapterAssignmentForBibleText(
  bibleTextId: number,
): Promise<ChapterAssignmentForClaim | null> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT ca.id AS chapter_assignment_id, ca.assigned_user_id AS assigned_user_id
     FROM bible_texts bt
     INNER JOIN chapter_assignments ca
       ON ca.bible_id = bt.bible_id
      AND ca.book_id = bt.book_id
      AND ca.chapter_number = bt.chapter_number
     WHERE bt.id = ?
     ORDER BY ca.id
     LIMIT 1`,
    [bibleTextId],
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
  bibleTextId: number,
  userId: number,
): Promise<boolean> {
  const db = getDatabase();
  const target = await getChapterAssignmentForBibleText(bibleTextId);
  if (!target) {
    log.info('No chapter assignment found for bible text, skipping claim', {
      bibleTextId,
    });
    return false;
  }
  if (target.assignedUserId !== null) {
    return false;
  }

  const claimedAt = new Date().toISOString();
  await db.transaction(async (tx: Transaction) => {
    await tx.execute(
      `INSERT INTO chapter_claim_queue
        (chapter_assignment_id, user_id, claimed_at, sync_status)
       VALUES (?, ?, ?, 'pending')`,
      [target.chapterAssignmentId, userId, claimedAt],
    );
    // Re-check inside the transaction as a race guard.
    await tx.execute(
      `UPDATE chapter_assignments
       SET assigned_user_id = ?
       WHERE id = ? AND assigned_user_id IS NULL`,
      [userId, target.chapterAssignmentId],
    );
  });

  log.info('Enqueued offline chapter claim', {
    chapterAssignmentId: target.chapterAssignmentId,
    userId,
  });
  return true;
}
