/**
 * #451 handoff binding onto PR #792 My Work comment-aggregate helpers
 * (fluent-api PR #459 `GET …/comment-aggregate`).
 *
 * Drawer/mutation clients call these after a successful local mutation wave —
 * never invent 0/false; never clear SQLite chapter rows.
 */

import {
  clearMyWorkCommentAggregates,
  getCommentAggregateCacheEntry,
  invalidateMyWorkCommentAggregateRefresh,
  refreshMyWorkCommentAggregates,
  type CommentAggregateCacheEntry,
} from './myWorkCommentAggregates';

export type CommentAggregateBindingRead = CommentAggregateCacheEntry;

/** Fail-closed cache read (same semantics as My Work row indicators). */
export function readBoundCommentAggregate(
  userId: string,
  chapterAssignmentId: number,
): CommentAggregateBindingRead {
  return getCommentAggregateCacheEntry(userId, chapterAssignmentId);
}

/**
 * Refresh aggregates for the open chapter (and optional neighbors) after a
 * comment create / reply / reaction that can change count or marker.
 */
export async function refreshBoundCommentAggregates(options: {
  userId: string;
  sessionToken: string;
  chapterAssignmentIds: readonly number[];
}): Promise<void> {
  await refreshMyWorkCommentAggregates(options);
}

/** Explicit invalidate so the next refresh does not join a stale in-flight wave. */
export function invalidateBoundCommentAggregateRefresh(userId: string): void {
  invalidateMyWorkCommentAggregateRefresh(userId);
}

/** Clear on sign-out / account removal — mirrors PR #792 accountSession path. */
export function clearBoundCommentAggregates(userId: string): void {
  clearMyWorkCommentAggregates(userId);
}
