import { getDatabase } from '../db';
import { uploadProjectUnitSql } from '../recordingsRepository';
import { logger } from '../../utils/logger';

const log = logger.create('HeldRecordingsRepository');

/**
 * Takes kept on the device because the account that recorded them is no longer
 * a member of the take's project (#855). They are never marked failed and stay
 * `held` until membership returns; the next upload pass releases them.
 */
export type HeldRecording = {
  id: string;
  projectId: number;
  projectName: string;
  bookId: number;
  bookName: string;
  chapterNumber: number;
  /** Anchor verse of the take (pericope takes keep their range too). */
  verseNumber: number;
  granularity: 'verse' | 'pericope';
  startChapter: number | null;
  startVerse: number | null;
  endChapter: number | null;
  endVerse: number | null;
  localFilePath: string;
  durationMs: number | null;
};

export type HeldReconcileResult = {
  held: number;
  released: number;
};

/**
 * Re-mark takes whose owner lost project membership (#855).
 *
 * Runs before every upload pass (and after metadata sync through the upload
 * orchestrator's sync-complete trigger):
 * - `held` rows whose owner is a member again become `pending` so the next
 *   pass uploads them with no extra user action.
 * - `pending` / `failed` rows whose owner is not a member become `held`
 *   instead of being retried into a permanent failure.
 *
 * Owner is the capture-time account, falling back to the active account for
 * legacy rows; shared devices keep each account's own membership.
 */
export async function reconcileHeldRecordings(
  activeUserId: number | null,
): Promise<HeldReconcileResult> {
  if (activeUserId === null || !Number.isFinite(activeUserId)) {
    return { held: 0, released: 0 };
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  // Captured unit, else the chapter's only assignment unit; `bt` aliases the
  // take's bible_texts row inside each subquery.
  const unit = uploadProjectUnitSql('recordings.project_unit_id');

  try {
    const outcome: HeldReconcileResult = { held: 0, released: 0 };
    await db.transaction(async tx => {
      const released = await tx.execute(
        `UPDATE recordings
         SET sync_status = 'pending',
             upload_error = NULL,
             updated_at = ?
         WHERE sync_status = 'held'
           AND EXISTS (
             SELECT 1
             FROM bible_texts bt
             JOIN project_units pu ON pu.id = ${unit}
             WHERE bt.id = recordings.bible_text_id
               AND EXISTS (
                 SELECT 1
                 FROM user_projects up
                 WHERE up.project_id = pu.project_id
                   AND up.user_id = COALESCE(recordings.recorded_by_user_id, ?)
               )
           )`,
        [now, activeUserId],
      );

      const held = await tx.execute(
        `UPDATE recordings
         SET sync_status = 'held',
             upload_error = NULL,
             updated_at = ?
         WHERE sync_status IN ('pending', 'failed')
           AND IFNULL(granularity, 'verse') IN ('verse', 'pericope')
           AND bible_text_id > 0
           AND EXISTS (
             SELECT 1
             FROM bible_texts bt
             JOIN project_units pu ON pu.id = ${unit}
             WHERE bt.id = recordings.bible_text_id
               AND NOT EXISTS (
                 SELECT 1
                 FROM user_projects up
                 WHERE up.project_id = pu.project_id
                   AND up.user_id = COALESCE(recordings.recorded_by_user_id, ?)
               )
           )`,
        [now, activeUserId],
      );

      outcome.held = Number(held.rowsAffected ?? 0);
      outcome.released = Number(released.rowsAffected ?? 0);
      if (outcome.held > 0 || outcome.released > 0) {
        log.info('Reconciled held recordings', {
          activeUserId,
          ...outcome,
        });
      }
    });
    return outcome;
  } catch (error) {
    // Never block an upload pass on the hold bookkeeping.
    log.error('Failed to reconcile held recordings', {
      activeUserId,
      error,
    });
    return { held: 0, released: 0 };
  }
}

/** Held takes for the active account, grouped-ready in display order. */
export async function getHeldRecordings(
  userId: number | null,
): Promise<HeldRecording[]> {
  if (userId === null || !Number.isFinite(userId)) {
    return [];
  }

  const db = getDatabase();
  const unit = uploadProjectUnitSql('r.project_unit_id');
  try {
    const result = await db.execute(
      `SELECT
         r.id AS id,
         r.local_file_path AS local_file_path,
         r.duration_ms AS duration_ms,
         IFNULL(r.granularity, 'verse') AS granularity,
         r.start_chapter AS start_chapter,
         r.start_verse AS start_verse,
         r.end_chapter AS end_chapter,
         r.end_verse AS end_verse,
         bt.book_id AS book_id,
         bt.chapter_number AS chapter_number,
         bt.verse_number AS verse_number,
         b.eng_display_name AS book_name,
         pu.project_id AS project_id,
         p.name AS project_name
       FROM recordings r
       JOIN bible_texts bt ON bt.id = r.bible_text_id
       JOIN project_units pu ON pu.id = ${unit}
       JOIN projects p ON p.id = pu.project_id
       JOIN books b ON b.id = bt.book_id
       WHERE r.sync_status = 'held'
         AND COALESCE(r.recorded_by_user_id, ?) = ?
       ORDER BY p.name, bt.book_id, bt.chapter_number, bt.verse_number,
                r.created_at`,
      [userId, userId],
    );

    const toNullableInt = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    return (result.rows ?? []).map(row => ({
      id: String(row.id),
      projectId: Number(row.project_id),
      projectName: String(row.project_name),
      bookId: Number(row.book_id),
      bookName: String(row.book_name),
      chapterNumber: Number(row.chapter_number),
      verseNumber: Number(row.verse_number),
      granularity:
        String(row.granularity) === 'pericope' ? 'pericope' : 'verse',
      startChapter: toNullableInt(row.start_chapter),
      startVerse: toNullableInt(row.start_verse),
      endChapter: toNullableInt(row.end_chapter),
      endVerse: toNullableInt(row.end_verse),
      localFilePath: String(row.local_file_path),
      durationMs: toNullableInt(row.duration_ms),
    }));
  } catch (error) {
    log.error('Failed to load held recordings', { userId, error });
    return [];
  }
}
