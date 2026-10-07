import {
  claimChapterAssignment,
  resolveChapterClaimQueueEntry,
  setChapterAssignmentConflict,
} from '../db/repository';
import {
  getChapterAssignmentById,
  getPendingChapterClaims,
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
 * reconnect (PM assign, elapsed CLAIM_RACE_WINDOW, etc.) — treat as local
 * conflict and stop retrying (#610).
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
 * finite assignee, or claim 404 held-by-other — #610). Leaves rows pending on
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
        conflicts += 1;
        await setChapterAssignmentConflict(row.chapterAssignmentId, true);
        await resolveChapterClaimQueueEntry(row.id);
        log.info('Pending claim resolved as conflict (claim 404)', {
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
 * After an assignment pull, mark conflict + clear queue when a pending claim's
 * chapter is now assigned to someone else (#610).
 */
export async function reconcilePendingClaimsAfterAssignmentPull(
  userId: number,
): Promise<{ conflicts: number }> {
  const pending = await getPendingChapterClaims();
  let conflicts = 0;

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
