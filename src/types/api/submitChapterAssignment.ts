import type { ApiChapterAssignment } from './types';

/**
 * Response from PATCH /chapter-assignments/{id}/submit.
 * Prefer the updated assignment when present; treat empty/unknown as success
 * if the HTTP call succeeded (web already uses this endpoint online).
 */
export type SubmitChapterAssignmentResponse =
  | ApiChapterAssignment
  | Record<string, unknown>
  | null;
