import {
  claimChapterAssignment,
  markChapterClaimQueueEntryRejected,
  resolveChapterClaimQueueEntry,
  setChapterAssignmentConflict,
} from '../db/repository';
import {
  getChapterAssignmentById,
  getPendingChapterClaims,
  getRejectedChapterClaims,
} from '../db/queries';
import { isApiError } from '../types/api/errors';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import type { NormalizedClaimChapterAssignmentResponse } from '../types/api/chapterClaim';

const log = logger.create('ChapterClaimSync');

function isFinitePositiveId(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Claim 404 means fluent-api will not return a race conflict for this
 * reconnect (PM assign, elapsed CLAIM_RACE_WINDOW, etc.) — treat as a terminal
 * conflict (stop retrying), persisted after the assignment pull (#610).
 */
export function isClaimHeldByOtherError(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/**
 * Pushes a chapter claim to the server (#268). On a winning claim, updates
 * local `assigned_user_id` for the active user. Race losers persist
 * `has_conflict` locally (#271 / #470).
 */
export async function syncChapterClaim(
  chapterAssignmentId: number,
  userId: number,
): Promise<NormalizedClaimChapterAssignmentResponse> {
  const response = await FluentAPI.claimChapterAssignment(
    chapterAssignmentId,
    userId,
  );
  if (response.hasClaimConflict) {
    await setChapterAssignmentConflict(chapterAssignmentId, true);
  } else if (response.assignedUserId === userId) {
    await claimChapterAssignment(chapterAssignmentId, userId);
  } else if (isFinitePositiveId(response.assignedUserId)) {
    // Definitive loss: another assignee without relying on the optional flag.
    await setChapterAssignmentConflict(chapterAssignmentId, true);
  }
  return response;
}

export type SyncPendingChapterClaimsResult = {
  synced: number;
  conflicts: number;
  failed: number;
};

/**
 * Syncs pending offline claims from `chapter_claim_queue` for the given user (#271).
 * Resolves each row on a definitive API outcome (win, conflict flag, other
 * finite assignee). A claim 404 (#610) counts as a conflict but marks the row
 * `claim_rejected` instead of resolving it — conflict is persisted and the row
 * dropped by `reconcilePendingClaimsAfterAssignmentPull` after the pull. Leaves rows pending on
 * transient failure or malformed / non-finite assignee so the next sync
 * cycle retries (#470).
 */
export async function syncPendingChapterClaims(
  userId: number,
): Promise<SyncPendingChapterClaimsResult> {
  const pending = await getPendingChapterClaims();
  let synced = 0;
  let conflicts = 0;
  let failed = 0;

  for (const row of pending) {
    if (row.userId !== userId) {
      continue;
    }

    try {
      const response = await syncChapterClaim(
        row.chapterAssignmentId,
        row.userId,
      );
      if (response.hasClaimConflict) {
        conflicts += 1;
        await resolveChapterClaimQueueEntry(row.id);
      } else if (response.assignedUserId === row.userId) {
        synced += 1;
        await resolveChapterClaimQueueEntry(row.id);
      } else if (isFinitePositiveId(response.assignedUserId)) {
        conflicts += 1;
        await resolveChapterClaimQueueEntry(row.id);
      } else {
        failed += 1;
        log.warn('Leaving claim queue row pending — ambiguous API response', {
          queueId: row.id,
          chapterAssignmentId: row.chapterAssignmentId,
          userId: row.userId,
          assignedUserId: response.assignedUserId,
          hasClaimConflict: response.hasClaimConflict,
        });
      }
    } catch (error) {
      if (isClaimHeldByOtherError(error)) {
        // Terminal for claim retries, but do NOT write has_conflict or drop the
        // row yet: the assignment pull that follows would clear a pre-pull flag.
        // reconcilePendingClaimsAfterAssignmentPull persists conflict + resolves.
        conflicts += 1;
        await markChapterClaimQueueEntryRejected(row.id);
        log.info('Pending claim rejected (claim 404); conflict after pull', {
          queueId: row.id,
          chapterAssignmentId: row.chapterAssignmentId,
          userId: row.userId,
        });
        continue;
      }
      failed += 1;
    }
  }

  return { synced, conflicts, failed };
}

/**
 * Run AFTER the assignment pull (#610). The pull upserts `has_conflict` from
 * the server and can clear a flag written earlier, so conflicts are persisted
 * here:
 * 1. Rows the claim POST rejected with 404 (PM assign, expired race window,
 *    still unassigned) always get `has_conflict` + queue resolve.
 * 2. Still-pending rows whose chapter is now assigned to someone else get
 *    `has_conflict` + queue resolve.
 */
export async function reconcilePendingClaimsAfterAssignmentPull(
  userId: number,
): Promise<{ conflicts: number }> {
  let conflicts = 0;

  const rejected = await getRejectedChapterClaims();
  for (const row of rejected) {
    if (row.userId !== userId) {
      continue;
    }
    await setChapterAssignmentConflict(row.chapterAssignmentId, true);
    await resolveChapterClaimQueueEntry(row.id);
    conflicts += 1;
    log.info('Rejected claim (404) conflict persisted after assignment pull', {
      queueId: row.id,
      chapterAssignmentId: row.chapterAssignmentId,
      userId: row.userId,
    });
  }

  const pending = await getPendingChapterClaims();

  for (const row of pending) {
    if (row.userId !== userId) {
      continue;
    }

    const assignment = await getChapterAssignmentById(row.chapterAssignmentId);
    const assignee = assignment?.assignedUserId;
    if (
      assignee === null ||
      assignee === undefined ||
      !isFinitePositiveId(assignee) ||
      assignee === userId
    ) {
      continue;
    }

    await setChapterAssignmentConflict(row.chapterAssignmentId, true);
    await resolveChapterClaimQueueEntry(row.id);
    conflicts += 1;
    log.info('Pending claim conflicted after assignment pull', {
      queueId: row.id,
      chapterAssignmentId: row.chapterAssignmentId,
      userId: row.userId,
      assignedUserId: assignee,
    });
  }

  return { conflicts };
}
