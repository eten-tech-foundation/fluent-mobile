import {
  getUserOrgGrants,
  hasProjectObserverGrant,
} from '../services/userOrgGrants';
import { getActiveUserId } from '../services/storage';
import type { MyWorkChapter } from '../types/db/types';
import type {
  DraftDownloadRequest,
  DraftDownloadRole,
} from '../types/draftDownload/types';
import {
  isEligibleOpenPeerCheckNonDrafter,
  isMyWorkObserverReviewStatus,
  MY_WORK_CHAPTER_STATUSES,
  MY_WORK_OBSERVER_REVIEW_STATUSES,
  type MyWorkObserverReviewStatus,
} from './myWorkChapterFilter';
import { parseUserId } from './parseUserId';

export {
  isMyWorkObserverReviewStatus,
  MY_WORK_OBSERVER_REVIEW_STATUSES,
  type MyWorkObserverReviewStatus,
};

/**
 * Exact role name from fluent-api `ROLES.PROJECT_TRANSLATOR` (`src/lib/roles.ts`,
 * blob `c5a9ffc170beefe91c37f2415e273602f17b6fb7`). Kept local to My Work —
 * do not add Translator helpers to shared `userOrgGrants`.
 */
const PROJECT_TRANSLATOR_ROLE_NAME = 'Project Translator';

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Derive Project Translator project IDs from the existing org-grant snapshot
 * (`getUserOrgGrants`). Unknown/revoked/unregistered → [] (fail closed).
 * Org-only grants (null projectId) excluded.
 */
export function getTranslatorProjectIds(userId: string): number[] {
  const snapshot = getUserOrgGrants(userId);
  if (snapshot.status !== 'known') return [];
  const ids = new Set<number>();
  for (const grant of snapshot.grants) {
    if (
      grant.roleName === PROJECT_TRANSLATOR_ROLE_NAME &&
      grant.projectId !== null &&
      isPositiveInteger(grant.projectId)
    ) {
      ids.add(grant.projectId);
    }
  }
  return [...ids];
}

export function hasProjectTranslatorGrant(
  userId: string,
  projectId: number,
): boolean {
  if (!isPositiveInteger(projectId)) return false;
  return getTranslatorProjectIds(userId).includes(projectId);
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
 * - Open peer_check (null peerChecker) for non-drafter Project Translator → `peer_check`
 * - Observer review stage + known Project Observer grant for user+project → `observer`
 * - Unknown grant snapshots never authorize observer / open peer
 *
 * Re-evaluate on every call from live assignment fields + current user.
 */
export function classifyMyWorkDraftDownloadRole(input: {
  userId: number;
  assignmentStatus: string;
  assignedUserId?: number | null | undefined;
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
    isEligibleOpenPeerCheckNonDrafter(
      {
        status: input.assignmentStatus,
        assignedUserId: input.assignedUserId ?? undefined,
        peerCheckerId: input.peerCheckerId ?? undefined,
      },
      input.userId,
    ) &&
    hasProjectTranslatorGrant(String(input.userId), input.projectId)
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
    | 'assignedUserId'
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
    assignedUserId: chapter.assignedUserId,
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
