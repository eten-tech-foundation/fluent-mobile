/**
 * GET /chapter-assignments/{chapterAssignmentId}/comment-aggregate
 * Pinned fluent-api PR #459 tip dfad78d7438caad4391ad77d2e442e7c921f88e1
 * (schema unchanged since earlier pins 40fa2e5 / lock-serialize d263764).
 *
 * Semantics at pin:
 * - commentCount = retained roots + replies + Unconnected (reactions excluded)
 * - currentUserHasCommented = authenticated viewer authored any retained comment
 *   (including replies / emoji-only); reaction-only → false
 * - No userId query param; viewer comes from the bearer session
 */
export interface ChapterCommentAggregate {
  chapterAssignmentId: number;
  commentCount: number;
  currentUserHasCommented: boolean;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Structural parse against the pinned schema. Never coerces.
 * When `expectedChapterAssignmentId` is set, payload id must match exactly.
 */
export function parseChapterCommentAggregate(
  value: unknown,
  expectedChapterAssignmentId?: number,
): ChapterCommentAggregate | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!isPositiveInt(raw.chapterAssignmentId)) {
    return null;
  }
  if (!isNonNegativeInt(raw.commentCount)) {
    return null;
  }
  if (typeof raw.currentUserHasCommented !== 'boolean') {
    return null;
  }
  if (
    expectedChapterAssignmentId !== undefined &&
    (!isPositiveInt(expectedChapterAssignmentId) ||
      raw.chapterAssignmentId !== expectedChapterAssignmentId)
  ) {
    return null;
  }
  return {
    chapterAssignmentId: raw.chapterAssignmentId,
    commentCount: raw.commentCount,
    currentUserHasCommented: raw.currentUserHasCommented,
  };
}
