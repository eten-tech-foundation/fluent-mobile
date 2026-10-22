import { hasProjectObserverGrant } from '../services/userOrgGrants';
import { getActiveUserId } from '../services/storage';
import type { MyWorkChapter } from '../types/db/types';
import type {
  DraftDownloadRequest,
  DraftDownloadRole,
} from '../types/draftDownload/types';
import { MY_WORK_CHAPTER_STATUSES } from './myWorkChapterFilter';
import { parseUserId } from './parseUserId';

/**
 * Review stages where a verified Project Observer grant can authorize an
 * observer download role (#505). Not applied to My Work list SQL until a typed
 * Observer navigation entry exists (no verse-detail dead-ends).
 */
export const MY_WORK_OBSERVER_REVIEW_STATUSES = [
  'community_review',
  'linguist_check',
  'theological_check',
  'consultant_check',
] as const;

export type MyWorkObserverReviewStatus =
  (typeof MY_WORK_OBSERVER_REVIEW_STATUSES)[number];

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isMyWorkObserverReviewStatus(
  status: string | null | undefined,
): status is MyWorkObserverReviewStatus {
  const normalized = normalizeStatus(status);
  return (MY_WORK_OBSERVER_REVIEW_STATUSES as readonly string[]).includes(
    normalized,
  );
}

/**
 * Active-account identity for draft-download request building.
 * Requires synced `parseUserId()` to exactly match `getActiveUserId()` so a
 * stale synced id cannot authorize another account's request.
 */
export function getValidatedMyWorkDownloadUserId(): number | null {
  const activeRaw = getActiveUserId();
  if (!activeRaw) {
    return null;
  }
  const synced = parseUserId();
  if (
    synced === null ||
    !isPositiveInteger(synced) ||
    activeRaw !== String(synced)
  ) {
    return null;
  }
  return synced;
}

/**
 * Classify draft-download role for a My Work row for the *current* user.
 * - Assigned peer checker at peer_check → `peer_check`
 * - Observer review stage + known Project Observer grant for user+project → `observer`
 * - Unknown grant snapshots never authorize observer
 * - Open peer (unassigned peer_check) is intentionally not classified: verified
 *   Translator role + drafter semantics are unavailable without guessing
 *
 * Re-evaluate on every call from live assignment fields + current user.
 */
export function classifyMyWorkDraftDownloadRole(input: {
  userId: number;
  assignmentStatus: string;
  peerCheckerId: number | null | undefined;
  projectId: number;
}): DraftDownloadRole | null {
  if (!isPositiveInteger(input.userId) || !isPositiveInteger(input.projectId)) {
    return null;
  }

  const status = normalizeStatus(input.assignmentStatus);

  if (
    status === MY_WORK_CHAPTER_STATUSES.PEER_CHECK &&
    input.peerCheckerId === input.userId
  ) {
    return 'peer_check';
  }

  if (
    isMyWorkObserverReviewStatus(status) &&
    hasProjectObserverGrant(String(input.userId), input.projectId)
  ) {
    return 'observer';
  }

  return null;
}

/**
 * Build a manual-start DraftDownloadRequest for an eligible My Work chapter.
 * Re-classifies role from live assignment fields + current userId on every
 * call. Returns null when ineligible/incomplete.
 */
export function buildMyWorkDraftDownloadRequest(
  chapter: Pick<
    MyWorkChapter,
    | 'id'
    | 'projectUnitId'
    | 'projectId'
    | 'bibleId'
    | 'bookId'
    | 'bookCode'
    | 'chapterNumber'
    | 'assignmentStatus'
    | 'peerCheckerId'
  >,
  userId: number,
): DraftDownloadRequest | null {
  if (!isPositiveInteger(userId)) {
    return null;
  }

  const role = classifyMyWorkDraftDownloadRole({
    userId,
    assignmentStatus: chapter.assignmentStatus,
    peerCheckerId: chapter.peerCheckerId,
    projectId: chapter.projectId,
  });
  if (!role) {
    return null;
  }

  if (
    !isPositiveInteger(chapter.id) ||
    !isPositiveInteger(chapter.projectUnitId) ||
    !isPositiveInteger(chapter.projectId) ||
    !isPositiveInteger(chapter.bibleId) ||
    !isPositiveInteger(chapter.bookId) ||
    !isPositiveInteger(chapter.chapterNumber)
  ) {
    return null;
  }
  const bookCode =
    typeof chapter.bookCode === 'string' ? chapter.bookCode.trim() : '';
  if (!bookCode) {
    return null;
  }

  return {
    chapterAssignmentId: chapter.id,
    projectUnitId: chapter.projectUnitId,
    projectId: chapter.projectId,
    userId,
    bibleId: chapter.bibleId,
    bookId: chapter.bookId,
    bookCode,
    chapterNumber: chapter.chapterNumber,
    role,
  };
}
