import { FluentAPI } from './api';

/**
 * Pushes a locally-confirmed chapter claim to the server. Local state
 * (repository.claimChapterAssignment) is already written before this runs.
 * Network I/O lives in FluentAPI.claimChapterAssignment (live when
 * CHAPTER_CLAIM_API_STUBBED is false; stub branch for rollback/tests).
 */
export async function syncChapterClaim(
  chapterAssignmentId: number,
  userId: number,
): Promise<{ ok: true }> {
  await FluentAPI.claimChapterAssignment(chapterAssignmentId, userId);
  return { ok: true };
}
