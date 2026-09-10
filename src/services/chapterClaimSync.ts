import {
  claimChapterAssignment,
  resolveChapterClaimQueueEntry,
  setChapterAssignmentConflict,
} from '../db/repository';
import { getPendingChapterClaims } from '../db/queries';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import type { NormalizedClaimChapterAssignmentResponse } from '../types/api/chapterClaim';

const log = logger.create('ChapterClaimSync');

function isFinitePositiveId(value: number): boolean {
  return Number.isFinite(value) && value > 0;
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
 * Resolves each row on a definitive API outcome (win, conflict flag, or other
 * finite assignee). Leaves rows pending on transient failure or malformed /
 * non-finite assignee so the next sync cycle retries (#470).
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
    } catch {
      failed += 1;
    }
  }

  return { synced, conflicts, failed };
}
