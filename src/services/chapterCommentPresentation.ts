/**
 * Map fluent-api PR #459 chapter comment wire rows into #451 presentation
 * OrderedComment view-models (no invented zeros / fake audio).
 */

import type { OrderedComment } from '../components/comments/commentPresentation';
import type { ChapterComment } from '../types/api/chapterComments';
import type { DraftCommentAnchor } from './draftCommentAnchor';

function formatCommentCreatedAtLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return iso;
  }
  return new Date(ms).toLocaleString();
}

export function mapChapterCommentToOrdered(
  comment: ChapterComment,
): OrderedComment {
  const sortKey = Date.parse(comment.createdAt);
  return {
    id: String(comment.id),
    parentId:
      comment.parentCommentId === null ? null : String(comment.parentCommentId),
    authorDisplayName: comment.author.displayName,
    authorRoleLabel: comment.author.roleDisplay ?? '',
    createdAtLabel: formatCommentCreatedAtLabel(comment.createdAt),
    text: comment.text,
    bodyEmoji: comment.bodyKind === 'emoji' ? comment.emoji : null,
    audioUri: comment.audio?.downloadUrl ?? null,
    connectionState: comment.connectionState,
    currentUserReactionEmoji: comment.currentUserReaction,
    sortKey: Number.isFinite(sortKey) ? sortKey : comment.id,
  };
}

export function flattenChapterCommentList(list: {
  connected: readonly ChapterComment[];
  unconnected: readonly ChapterComment[];
}): ChapterComment[] {
  return [...list.connected, ...list.unconnected];
}

/**
 * Connected comments for a draft-surface anchor + all retained Unconnected for
 * the chapter (product decision 3). When `anchor` is null, return the full
 * chapter list (chapter-wide entry).
 */
export function filterCommentsForDrawer(
  comments: readonly ChapterComment[],
  anchor: DraftCommentAnchor | null,
): ChapterComment[] {
  if (anchor === null) {
    return [...comments];
  }
  return comments.filter(comment => {
    if (comment.connectionState === 'unconnected') {
      return true;
    }
    if (anchor.kind === 'verse') {
      return comment.anchor.bibleTextId === anchor.bibleTextId;
    }
    return (
      comment.anchor.kind === 'pericope' &&
      comment.anchor.pericopeNumber === anchor.pericopeNumber
    );
  });
}

/** @deprecated Prefer {@link filterCommentsForDrawer}. */
export function filterCommentsForVerseDrawer(
  comments: readonly ChapterComment[],
  bibleTextId: number | null,
): ChapterComment[] {
  return filterCommentsForDrawer(
    comments,
    bibleTextId === null ? null : { kind: 'verse', bibleTextId },
  );
}

/** Positive counts per verse bibleTextId (roots+replies+Unconnected with id). */
export function countCommentsByBibleTextId(
  comments: readonly ChapterComment[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const comment of comments) {
    const bibleTextId = comment.anchor.bibleTextId;
    if (bibleTextId === null || !Number.isInteger(bibleTextId)) {
      continue;
    }
    counts.set(bibleTextId, (counts.get(bibleTextId) ?? 0) + 1);
  }
  return counts;
}

/** Positive counts per pericopeNumber (connected pericope-anchored rows). */
export function countCommentsByPericopeNumber(
  comments: readonly ChapterComment[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const comment of comments) {
    if (comment.anchor.kind !== 'pericope') {
      continue;
    }
    const pericopeNumber = comment.anchor.pericopeNumber;
    if (pericopeNumber === null || pericopeNumber.length === 0) {
      continue;
    }
    counts.set(pericopeNumber, (counts.get(pericopeNumber) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fail-closed count for an active draft unit. Missing / unknown → null
 * (indicator must not invent zero).
 */
export function commentCountForAnchor(
  comments: readonly ChapterComment[],
  anchor: DraftCommentAnchor | null,
): number | null {
  if (anchor === null) {
    return null;
  }
  if (anchor.kind === 'verse') {
    const n = countCommentsByBibleTextId(comments).get(anchor.bibleTextId);
    return typeof n === 'number' ? n : null;
  }
  const n = countCommentsByPericopeNumber(comments).get(anchor.pericopeNumber);
  return typeof n === 'number' ? n : null;
}
