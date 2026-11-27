import { getDatabase } from '../db';
import { uploadProjectUnitSql } from '../recordingsRepository';
import { claimChapterInTransaction } from './chapterClaimsRepository';
import { VERSE_AUDIO_ACCESS_DENIED_MESSAGE } from '../../types/api/errors';
import { logger } from '../../utils/logger';

const log = logger.create('HeldRecordingsRepository');

/**
 * `upload_error` on a `pending` take that left `held` (#855). Pending rows
 * never show `upload_error`; the upload worker reads it to put the take back
 * to `held` instead of failing it when the PUT is still denied.
 */
export const RELEASED_FROM_HOLD_MARKER = 'released_from_hold';

/**
 * Prefix of `upload_error` on a take put back to `held` after the server
 * still denied it. The rest is the chapter assignment as it was then
 * (see `ASSIGNMENT_FINGERPRINT_SQL`); the take is not released again until that
 * changes, so a denial this device cannot predict (peer check, a stale cache)
 * costs one upload instead of one per sync (#855).
 */
export const DENIED_HOLD_PREFIX = 'denied:';

/**
 * `upload_error` on held takes whose chapter this device already claimed back
 * automatically (#855). A chapter is claimed at most once per hold: a claim
 * the server refuses (a role that cannot claim) must not repeat every sync.
 */
export const AUTO_CLAIMED_HOLD_MARKER = 'auto_claimed';

/**
 * Why a take is held:
 * - `removed`: the owner is not a member of the take's project.
 * - `unassigned`: the owner is a member again, but the chapter is still in
 *   drafting with no drafter or another one (or its claim has not landed), so
 *   the server would deny the upload until it is assigned to the owner.
 * - `denied`: the owner is a member and nothing local explains it, but the
 *   server denied the upload; it is retried once the assignment changes.
 * - `waiting`: nothing stands in the way; the take uploads on its own once a
 *   claim this device sent lands, or on the next sync.
 */
export type HeldReason = 'removed' | 'unassigned' | 'denied' | 'waiting';

const HELD_REASONS: readonly HeldReason[] = [
  'removed',
  'unassigned',
  'denied',
  'waiting',
];

function isHeldReason(value: unknown): value is HeldReason {
  return HELD_REASONS.includes(value as HeldReason);
}

/**
 * Takes kept on the device because the account that recorded them cannot
 * upload them yet (#855): it was removed from the project, or it was added
 * back but is not the chapter's drafter. They are never marked failed and stay
 * `held` until an upload can succeed; the next upload pass releases them.
 */
export type HeldRecording = {
  id: string;
  reason: HeldReason;
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
  /** Per verse + owner take number, so multiple held takes stay distinct. */
  takeNumber: number;
  localFilePath: string;
  durationMs: number | null;
};

export type HeldReconcileResult = {
  held: number;
  released: number;
};

/**
 * True when at least one take is in a state project membership can change
 * (pending, failed, uploading or held). Unlike `getRecordingOwnerIds`, this
 * does not count the active account, so an empty device answers false and the
 * orchestrator can skip the membership request entirely.
 */
export async function hasRecordingsAffectedByMembership(): Promise<boolean> {
  const db = getDatabase();
  const result = await db.execute(
    `SELECT 1 AS found
     FROM recordings
     WHERE sync_status IN ('pending', 'failed', 'uploading', 'held')
       AND IFNULL(granularity, 'verse') IN ('verse', 'pericope')
       AND bible_text_id > 0
     LIMIT 1`,
  );
  return (result.rows?.length ?? 0) > 0;
}

/**
 * Accounts that own work this reconcile could touch, plus the active account.
 * Legacy rows without an owner belong to the active account.
 */
export async function getRecordingOwnerIds(
  activeUserId: number | null,
): Promise<number[]> {
  const owners = new Set<number>();
  if (activeUserId !== null && Number.isFinite(activeUserId)) {
    owners.add(activeUserId);
  }
  const db = getDatabase();
  const result = await db.execute(
    `SELECT DISTINCT COALESCE(recorded_by_user_id, ?) AS owner_id
     FROM recordings
     WHERE sync_status IN ('pending', 'failed', 'uploading', 'held')
       AND IFNULL(granularity, 'verse') IN ('verse', 'pericope')
       AND bible_text_id > 0`,
    [activeUserId],
  );
  for (const row of result.rows ?? []) {
    const id = Number(row.owner_id);
    if (Number.isFinite(id) && id > 0) {
      owners.add(id);
    }
  }
  return [...owners];
}

/**
 * True (SQL) when the take's chapter is still in drafting and its drafter is
 * not the take's owner. fluent-api lets a translator PUT drafting audio only
 * as the chapter's drafter, and removing a user from a project clears their
 * assignments while re-adding them does not restore those. Uploading then
 * would be denied as a masked 404 (#855). Needs `bt` and `pu` in scope; the
 * one placeholder binds the active account for legacy rows.
 */
function drafterMismatchSql(recordingAlias: string): string {
  return `EXISTS (
  SELECT 1
  FROM chapter_assignments ca
  WHERE ca.project_unit_id = pu.id
    AND ca.bible_id = bt.bible_id
    AND ca.book_id = bt.book_id
    AND ca.chapter_number = bt.chapter_number
    AND ca.status IN ('not_started', 'draft')
    AND (
      ca.assigned_user_id IS NULL
      OR ca.assigned_user_id != COALESCE(${recordingAlias}.recorded_by_user_id, ?)
      OR (
        -- Not started and assigned locally means an offline claim: the server
        -- still says not started until it lands, and denies the upload.
        ca.status = 'not_started'
        AND EXISTS (
          SELECT 1
          FROM chapter_claim_queue q
          WHERE q.chapter_assignment_id = ca.id
            AND q.sync_status IN ('pending', 'claim_rejected')
        )
      )
    )
)`;
}

/**
 * The take's chapter assignment as one string (`none` without a row), stored
 * with a denied hold. Needs `bt` and `pu` in scope.
 */
const ASSIGNMENT_FINGERPRINT_SQL = `COALESCE((
  SELECT ca.status
         || ':' || IFNULL(ca.assigned_user_id, '')
         || ':' || IFNULL(ca.peer_checker_id, '')
         || ':' || IFNULL(ca.updated_at, '')
  FROM chapter_assignments ca
  WHERE ca.project_unit_id = pu.id
    AND ca.bible_id = bt.bible_id
    AND ca.book_id = bt.book_id
    AND ca.chapter_number = bt.chapter_number
  LIMIT 1
), 'none')`;

/**
 * Re-mark takes whose owner cannot upload them (#855).
 *
 * Runs before every upload pass (and after metadata sync through the upload
 * orchestrator's sync-complete trigger), in this order:
 * - `failed` rows the server denied with the masked 404 become `held`, so
 *   takes failed by an earlier build recover with no user action.
 * - Held takes of the active account on an unassigned, not-started chapter
 *   claim it (the same offline claim a first recording makes). They stay held
 *   until the claim lands; the session that pushes it asks for a follow-up.
 * - `held` rows become `pending` once their owner is a member again and, for a
 *   chapter still in drafting, is its drafter. Otherwise they stay held: a
 *   manager reassigning the chapter releases them on a later pass. A take the
 *   server already denied waits until its chapter assignment changes.
 * - `pending` / `failed` rows whose owner is not a member become `held`
 *   instead of being retried into a permanent failure.
 * - `uploading` rows are included because a process kill mid-upload leaves
 *   that status behind and [`getPendingRecordings`] still returns it. Passes
 *   and their reconciliation run one at a time before any take is marked
 *   `uploading`, so a row matched here has no live upload: it is either this
 *   pass (not yet started) or an interrupted earlier one. A take held by the
 *   transition keeps its upload operation state and resumes once membership
 *   returns, the same as a held `pending` row.
 *
 * Owner is the capture-time account, falling back to the active account for
 * legacy rows; shared devices keep each account's own membership. Only
 * `verifiedOwnerIds` (accounts whose membership the server just confirmed) are
 * acted on: a stale cache for any other account must neither hold nor release.
 */
export async function reconcileHeldRecordings(
  activeUserId: number | null,
  verifiedOwnerIds: readonly number[],
): Promise<HeldReconcileResult> {
  if (activeUserId === null || !Number.isFinite(activeUserId)) {
    return { held: 0, released: 0 };
  }
  if (verifiedOwnerIds.length === 0) {
    return { held: 0, released: 0 };
  }
  const ownerPlaceholders = verifiedOwnerIds.map(() => '?').join(', ');
  const ownerFilter = `AND COALESCE(recordings.recorded_by_user_id, ?) IN (${ownerPlaceholders})`;

  const db = getDatabase();
  const now = new Date().toISOString();
  // Captured unit, else the chapter's only assignment unit; `bt` aliases the
  // take's bible_texts row inside each subquery.
  const unit = uploadProjectUnitSql('recordings.project_unit_id');

  try {
    const outcome: HeldReconcileResult = { held: 0, released: 0 };
    let claimed = 0;
    await db.transaction(async tx => {
      // Earlier builds failed denied takes outright. Only rows whose unit
      // resolves can show in the held list, so the rest keep failing visibly.
      const deniedHeld = await tx.execute(
        `UPDATE recordings
         SET sync_status = 'held',
             project_unit_id = (
               SELECT ${unit}
               FROM bible_texts bt
               WHERE bt.id = recordings.bible_text_id
             ),
             recorded_by_user_id = COALESCE(recorded_by_user_id, ?),
             upload_error = NULL,
             updated_at = ?
         WHERE sync_status = 'failed'
           AND upload_error = ?
           AND IFNULL(granularity, 'verse') IN ('verse', 'pericope')
           AND bible_text_id > 0
           AND EXISTS (
             SELECT 1
             FROM bible_texts bt
             JOIN project_units pu ON pu.id = ${unit}
             WHERE bt.id = recordings.bible_text_id
           )
           ${ownerFilter}`,
        [
          activeUserId,
          now,
          VERSE_AUDIO_ACCESS_DENIED_MESSAGE,
          activeUserId,
          ...verifiedOwnerIds,
        ],
      );

      // Claims go out under the active account's token only, so only its
      // held takes claim. Another account's takes wait until it is active.
      if (verifiedOwnerIds.includes(activeUserId)) {
        const claimUnit = uploadProjectUnitSql('r.project_unit_id');
        const claimable = await tx.execute(
          `SELECT DISTINCT ca.id AS chapter_assignment_id,
                  ca.bible_id AS bible_id,
                  ca.book_id AS book_id,
                  ca.chapter_number AS chapter_number
           FROM recordings r
           JOIN bible_texts bt ON bt.id = r.bible_text_id
           JOIN project_units pu ON pu.id = ${claimUnit}
           JOIN chapter_assignments ca
             ON ca.project_unit_id = pu.id
            AND ca.bible_id = bt.bible_id
            AND ca.book_id = bt.book_id
            AND ca.chapter_number = bt.chapter_number
           WHERE r.sync_status = 'held'
             AND COALESCE(r.recorded_by_user_id, ?) = ?
             AND ca.assigned_user_id IS NULL
             AND ca.status = 'not_started'
             AND EXISTS (
               SELECT 1
               FROM user_projects up
               WHERE up.project_id = pu.project_id
                 AND up.user_id = ?
             )
             AND NOT EXISTS (
               SELECT 1
               FROM recordings r2
               JOIN bible_texts bt2 ON bt2.id = r2.bible_text_id
               WHERE r2.sync_status = 'held'
                 AND r2.upload_error = ?
                 AND COALESCE(r2.recorded_by_user_id, ?) = ?
                 AND bt2.bible_id = ca.bible_id
                 AND bt2.book_id = ca.book_id
                 AND bt2.chapter_number = ca.chapter_number
             )`,
          [
            activeUserId,
            activeUserId,
            activeUserId,
            AUTO_CLAIMED_HOLD_MARKER,
            activeUserId,
            activeUserId,
          ],
        );
        for (const row of claimable.rows ?? []) {
          const chapterAssignmentId = Number(row.chapter_assignment_id);
          if (
            !(await claimChapterInTransaction(
              tx,
              chapterAssignmentId,
              activeUserId,
              now,
            ))
          ) {
            continue;
          }
          await tx.execute(
            `UPDATE recordings
             SET upload_error = ?
             WHERE sync_status = 'held'
               AND COALESCE(recorded_by_user_id, ?) = ?
               AND bible_text_id IN (
                 SELECT id
                 FROM bible_texts
                 WHERE bible_id = ? AND book_id = ? AND chapter_number = ?
               )`,
            [
              AUTO_CLAIMED_HOLD_MARKER,
              activeUserId,
              activeUserId,
              Number(row.bible_id),
              Number(row.book_id),
              Number(row.chapter_number),
            ],
          );
          claimed += 1;
        }
      }

      const released = await tx.execute(
        `UPDATE recordings
         SET sync_status = 'pending',
             upload_error = ?,
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
               AND NOT ${drafterMismatchSql('recordings')}
               AND (
                 recordings.upload_error IS NULL
                 OR recordings.upload_error NOT LIKE '${DENIED_HOLD_PREFIX}%'
                 OR recordings.upload_error
                   != '${DENIED_HOLD_PREFIX}' || ${ASSIGNMENT_FINGERPRINT_SQL}
               )
           )
           ${ownerFilter}`,
        [
          RELEASED_FROM_HOLD_MARKER,
          now,
          activeUserId,
          activeUserId,
          activeUserId,
          ...verifiedOwnerIds,
        ],
      );

      const held = await tx.execute(
        `UPDATE recordings
         SET sync_status = 'held',
             project_unit_id = (
               SELECT ${unit}
               FROM bible_texts bt
               WHERE bt.id = recordings.bible_text_id
             ),
             recorded_by_user_id = COALESCE(recorded_by_user_id, ?),
             upload_error = NULL,
             updated_at = ?
         WHERE sync_status IN ('pending', 'failed', 'uploading')
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
           )
           ${ownerFilter}`,
        [activeUserId, now, activeUserId, activeUserId, ...verifiedOwnerIds],
      );

      const deniedHeldCount = Number(deniedHeld.rowsAffected ?? 0);
      outcome.held = Number(held.rowsAffected ?? 0) + deniedHeldCount;
      outcome.released = Number(released.rowsAffected ?? 0);
      if (outcome.held > 0 || outcome.released > 0 || claimed > 0) {
        log.info('Reconciled held recordings', {
          activeUserId,
          ...outcome,
          deniedHeld: deniedHeldCount,
          claimed,
        });
      }
    });
    return outcome;
  } catch (error) {
    log.error('Failed to reconcile held recordings', {
      activeUserId,
      error,
    });
    // A failed transaction is not a clean reconcile: callers must treat
    // membership as unconfirmed and defer, never upload past the check (#855).
    throw error;
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
         r.take_number AS take_number,
         bt.book_id AS book_id,
         bt.chapter_number AS chapter_number,
         bt.verse_number AS verse_number,
         b.eng_display_name AS book_name,
         pu.project_id AS project_id,
         p.name AS project_name,
         CASE
           WHEN NOT EXISTS (
             SELECT 1
             FROM user_projects up
             WHERE up.project_id = pu.project_id
               AND up.user_id = COALESCE(r.recorded_by_user_id, ?)
           ) THEN 'removed'
           WHEN EXISTS (
             SELECT 1
             FROM chapter_assignments ca
             JOIN chapter_claim_queue q ON q.chapter_assignment_id = ca.id
             WHERE ca.project_unit_id = pu.id
               AND ca.bible_id = bt.bible_id
               AND ca.book_id = bt.book_id
               AND ca.chapter_number = bt.chapter_number
               AND q.sync_status = 'pending'
           ) THEN 'waiting'
           WHEN ${drafterMismatchSql('r')} THEN 'unassigned'
           WHEN r.upload_error LIKE '${DENIED_HOLD_PREFIX}%' THEN 'denied'
           ELSE 'waiting'
         END AS reason
       FROM recordings r
       JOIN bible_texts bt ON bt.id = r.bible_text_id
       JOIN project_units pu ON pu.id = ${unit}
       JOIN projects p ON p.id = pu.project_id
       JOIN books b ON b.id = bt.book_id
       WHERE r.sync_status = 'held'
         AND COALESCE(r.recorded_by_user_id, ?) = ?
       ORDER BY p.name, bt.book_id, bt.chapter_number, bt.verse_number,
                r.created_at`,
      [userId, userId, userId, userId],
    );

    const toNullableInt = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    return (result.rows ?? []).map(row => ({
      id: String(row.id),
      reason: isHeldReason(row.reason) ? row.reason : 'removed',
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
      takeNumber: toNullableInt(row.take_number) ?? 1,
      localFilePath: String(row.local_file_path),
      durationMs: toNullableInt(row.duration_ms),
    }));
  } catch (error) {
    log.error('Failed to load held recordings', { userId, error });
    return [];
  }
}

/**
 * Put a released take back to `held` after the server still denied its upload
 * (#855), recording the chapter assignment it was denied under so it is not
 * released again until that changes. Generation-checked like the other status
 * writes, so a newer local change wins. Resolves false when that change owns
 * the row.
 */
export async function returnRecordingToHold(
  id: string,
  expectedIntentVersion: number,
): Promise<boolean> {
  const db = getDatabase();
  const result = await db.execute(
    `UPDATE recordings
     SET sync_status = 'held',
         upload_error = '${DENIED_HOLD_PREFIX}' || COALESCE((
           SELECT ${ASSIGNMENT_FINGERPRINT_SQL}
           FROM bible_texts bt
           JOIN project_units pu
             ON pu.id = ${uploadProjectUnitSql('recordings.project_unit_id')}
           WHERE bt.id = recordings.bible_text_id
         ), 'none'),
         updated_at = ?
     WHERE id = ? AND upload_intent_version = ?`,
    [new Date().toISOString(), id, expectedIntentVersion],
  );
  return (result.rowsAffected ?? 0) > 0;
}

/** True when `userId` owns a held take, so a landed claim may release some. */
export async function hasHeldRecordingsForUser(
  userId: number,
): Promise<boolean> {
  const db = getDatabase();
  try {
    const result = await db.execute(
      `SELECT 1 AS found
       FROM recordings
       WHERE sync_status = 'held'
         AND COALESCE(recorded_by_user_id, ?) = ?
       LIMIT 1`,
      [userId, userId],
    );
    return (result.rows?.length ?? 0) > 0;
  } catch (error) {
    log.error('Failed to check for held recordings', { userId, error });
    return false;
  }
}
