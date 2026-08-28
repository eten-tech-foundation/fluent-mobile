/** Wire shape for POST /chapter-assignments/:id/claim (fluent-api#272). */
export interface ClaimChapterAssignmentResponse {
  id: number;
  assignedUserId: number;
  status: string;
  hasClaimConflict?: boolean;
}

/** Normalized shape used by FluentAPI (compat with stub branch). */
export interface NormalizedClaimChapterAssignmentResponse {
  chapterAssignmentId: number;
  assignedUserId: number;
  status: string;
  hasClaimConflict: boolean;
}

export function normalizeClaimResponse(
  api: ClaimChapterAssignmentResponse,
): NormalizedClaimChapterAssignmentResponse {
  return {
    chapterAssignmentId: api.id,
    assignedUserId: api.assignedUserId,
    status: api.status,
    hasClaimConflict: api.hasClaimConflict ?? false,
  };
}
