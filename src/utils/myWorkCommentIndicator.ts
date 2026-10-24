import type { MyWorkChapter } from '../types/db/types';
import {
  getActiveUserId,
  getKnownUserIds,
  isReauthRequired,
} from '../services/storage';
import { parseUserId } from './parseUserId';

export type MyWorkCommentIndicator = {
  commentCount: number;
  currentUserHasCommented: boolean;
  accessibilityLabel: string;
};

function resolveValidatedAccountUserId(): string | null {
  const activeRaw = getActiveUserId();
  if (!activeRaw) {
    return null;
  }
  const synced = parseUserId();
  if (synced === null || activeRaw !== String(synced)) {
    return null;
  }
  // Same fail-closed account gate as comment-aggregate cache reads.
  if (!getKnownUserIds().includes(activeRaw) || isReauthRequired(activeRaw)) {
    return null;
  }
  return activeRaw;
}

/**
 * Known comment indicator for a My Work row.
 * Returns null when aggregate is missing/unknown, count/marker invalid, or the
 * snapshot belongs to a different account than the current validated session.
 */
export function getMyWorkCommentIndicator(
  chapter: Pick<MyWorkChapter, 'commentAggregate'>,
): MyWorkCommentIndicator | null {
  const aggregate = chapter.commentAggregate;
  if (!aggregate || aggregate.status !== 'known') {
    return null;
  }
  const currentUserId = resolveValidatedAccountUserId();
  if (currentUserId === null || aggregate.originatingUserId !== currentUserId) {
    return null;
  }
  if (
    typeof aggregate.commentCount !== 'number' ||
    !Number.isInteger(aggregate.commentCount) ||
    aggregate.commentCount < 0 ||
    typeof aggregate.currentUserHasCommented !== 'boolean'
  ) {
    return null;
  }

  const countLabel =
    aggregate.commentCount === 1
      ? '1 comment'
      : `${aggregate.commentCount} comments`;
  const accessibilityLabel = aggregate.currentUserHasCommented
    ? `${countLabel}, you commented`
    : countLabel;

  return {
    commentCount: aggregate.commentCount,
    currentUserHasCommented: aggregate.currentUserHasCommented,
    accessibilityLabel,
  };
}
