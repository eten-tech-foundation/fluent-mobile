import {
  claimChapterAssignment,
  resolveChapterClaimQueueEntry,
  setChapterAssignmentConflict,
} from '../db/repository';
import { getPendingChapterClaims } from '../db/queries';
import { FluentAPI } from './api';
import type { NormalizedClaimChapterAssignmentResponse } from '../types/api/chapterClaim';

/**
 * Pushes a chapter claim to the server (#268). On a winning claim, updates
 * local `assigned_user_id` for the active user. Race losers persist
 * `has_conflict` locally (#271).
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
 * Resolves each row on a definitive API outcome; leaves rows pending on
 * transient failure so the next sync cycle retries.
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
      } else if (response.assignedUserId === row.userId) {
        synced += 1;
      }
      await resolveChapterClaimQueueEntry(row.id);
    } catch {
      failed += 1;
    }
  }

  return { synced, conflicts, failed };
}
