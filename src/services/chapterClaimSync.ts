import { claimChapterAssignment } from '../db/repository';
import { FluentAPI } from './api';
import type { NormalizedClaimChapterAssignmentResponse } from '../types/api/chapterClaim';

/**
 * Pushes a chapter claim to the server (#268). On a winning claim, updates
 * local `assigned_user_id` for the active user. Race losers (`hasClaimConflict`)
 * return the API response without error — conflict UI/persistence is #271.
 */
export async function syncChapterClaim(
  chapterAssignmentId: number,
  userId: number,
): Promise<NormalizedClaimChapterAssignmentResponse> {
  const response = await FluentAPI.claimChapterAssignment(
    chapterAssignmentId,
    userId,
  );
  if (!response.hasClaimConflict && response.assignedUserId === userId) {
    await claimChapterAssignment(chapterAssignmentId, userId);
  }
  return response;
}
