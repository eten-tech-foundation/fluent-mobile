/**
 * GET /chapter-assignments/{chapterAssignmentId}/comment-aggregate
 * Pinned fluent-api PR #459 head 40fa2e5657fc91cbac24c3473fd572e702db0684
 * (chapterCommentAggregateSchema / ChapterCommentAggregate).
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
