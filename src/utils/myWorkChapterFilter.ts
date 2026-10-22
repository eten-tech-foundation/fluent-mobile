import type { MyWorkListAccess } from '../types/db/types';

export const MY_WORK_CHAPTER_STATUSES = {
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  PEER_CHECK: 'peer_check',
} as const;

/**
 * Review stages eligible for Observer My Work rows when grant + membership
 * are verified (#505). Kept here (import-free of native modules) so query
 * tests do not pull op-sqlite via userOrgGrants / storage.
 */
export const MY_WORK_OBSERVER_REVIEW_STATUSES = [
  'community_review',
  'linguist_check',
  'theological_check',
  'consultant_check',
] as const;

export type MyWorkObserverReviewStatus =
  (typeof MY_WORK_OBSERVER_REVIEW_STATUSES)[number];

/** Assigned/peer predicate only (no Observer / open-peer branches). */
export const MY_WORK_ASSIGNED_CHAPTER_WHERE = `(ca.status IN (?, ?) AND ca.assigned_user_id = ?)
  OR (ca.status = ? AND ca.peer_checker_id = ?)`;

/** Assigned-only WHERE fragment (no Observer IN-list). */
export const MY_WORK_CHAPTER_WHERE = MY_WORK_ASSIGNED_CHAPTER_WHERE;

/**
 * Open Peer Check list branch (#505 / #442): unassigned peer_check, persisted
 * drafter present and not the current user, Project Translator project IDs,
 * plus `user_projects` membership. Params: status, userId, ...projectIds, userId.
 */
export const MY_WORK_OPEN_PEER_CHAPTER_WHERE = `(
    ca.status = ?
    AND ca.peer_checker_id IS NULL
    AND ca.assigned_user_id IS NOT NULL
    AND ca.assigned_user_id != ?
    AND pu.project_id IN (%PROJECT_IDS%)
    AND EXISTS (
      SELECT 1
      FROM user_projects up
      WHERE up.user_id = ?
        AND up.project_id = pu.project_id
    )
  )`;

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
 * Pure open Peer Check non-drafter predicate for My Work list/download.
 *
 * Mirrors verified semantics from mobile PR #538 merge
 * `fb634e598e2f83ebef07e89c8ff495964c8a0940` (`src/utils/stageAdvancement.ts`:
 * `peer_check` + `typeof peerCheckerId !== 'number'` + persisted
 * `assignedUserId` present and not current user) and fluent-api PR #334 merge
 * `daff8385b4c14573b87b2cd9ad88c6b81f4d6d23` (`ChapterAssignmentPolicy.edit`
 * open Peer Check branch). Role/membership checked by callers — kept local so
 * this module stays free of stageAdvancement / service runtime imports.
 */
export function isEligibleOpenPeerCheckNonDrafter(
  chapterData: {
    status?: string | null;
    assignedUserId?: number | null;
    peerCheckerId?: number | null;
  },
  currentUserId: number | null,
): boolean {
  if (currentUserId === null || !isPositiveInteger(currentUserId)) {
    return false;
  }
  if (
    normalizeStatus(chapterData.status) !== MY_WORK_CHAPTER_STATUSES.PEER_CHECK
  ) {
    return false;
  }
  if (typeof chapterData.peerCheckerId === 'number') {
    return false;
  }
  if (typeof chapterData.assignedUserId !== 'number') {
    return false;
  }
  return chapterData.assignedUserId !== currentUserId;
}

/** Dedupe positive integer project IDs for parameterized IN bindings. */
export function normalizeMyWorkGrantProjectIds(
  grantProjectIds: readonly number[] | undefined,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of grantProjectIds ?? []) {
    if (!isPositiveInteger(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function getMyWorkAssignedChapterQueryParams(
  userId: number,
): (string | number)[] {
  return [
    MY_WORK_CHAPTER_STATUSES.NOT_STARTED,
    MY_WORK_CHAPTER_STATUSES.DRAFT,
    userId,
    MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
    userId,
  ];
}

/** @deprecated Prefer buildMyWorkChapterFilter. */
export function getMyWorkChapterQueryParams(
  userId: number,
): (string | number)[] {
  return getMyWorkAssignedChapterQueryParams(userId);
}

function membershipProjectWhere(
  projectIds: readonly number[],
  statusInSql: string,
  statusParams: readonly (string | number)[],
  userId: number,
): { whereSql: string; params: (string | number)[] } {
  const projectPlaceholders = projectIds.map(() => '?').join(', ');
  return {
    whereSql: `(
    ${statusInSql}
    AND pu.project_id IN (${projectPlaceholders})
    AND EXISTS (
      SELECT 1
      FROM user_projects up
      WHERE up.user_id = ?
        AND up.project_id = pu.project_id
    )
  )`,
    params: [...statusParams, ...projectIds, userId],
  };
}

/**
 * Build My Work WHERE + bindings.
 * Assigned/peer rows unchanged; Observer review and open Peer Check branches
 * only when their project-ID lists are non-empty, matched via `pu.project_id`,
 * with `user_projects` membership for the same user + project.
 */
export function buildMyWorkChapterFilter(
  userId: number,
  grantProjectIds?: readonly number[],
  translatorProjectIds?: readonly number[],
): { whereSql: string; params: (string | number)[] } {
  const assignedParams = getMyWorkAssignedChapterQueryParams(userId);
  const observerIds = normalizeMyWorkGrantProjectIds(grantProjectIds);
  const translatorIds = normalizeMyWorkGrantProjectIds(translatorProjectIds);

  const branches: string[] = [`(${MY_WORK_ASSIGNED_CHAPTER_WHERE})`];
  const params: (string | number)[] = [...assignedParams];

  if (translatorIds.length > 0) {
    const projectPlaceholders = translatorIds.map(() => '?').join(', ');
    branches.push(
      MY_WORK_OPEN_PEER_CHAPTER_WHERE.replace(
        '%PROJECT_IDS%',
        projectPlaceholders,
      ),
    );
    params.push(
      MY_WORK_CHAPTER_STATUSES.PEER_CHECK,
      userId,
      ...translatorIds,
      userId,
    );
  }

  if (observerIds.length > 0) {
    const statusPlaceholders = MY_WORK_OBSERVER_REVIEW_STATUSES.map(
      () => '?',
    ).join(', ');
    const observer = membershipProjectWhere(
      observerIds,
      `ca.status IN (${statusPlaceholders})`,
      MY_WORK_OBSERVER_REVIEW_STATUSES,
      userId,
    );
    branches.push(observer.whereSql);
    params.push(...observer.params);
  }

  return {
    whereSql: branches.join(' OR '),
    params,
  };
}

/**
 * Classify list access from live assignment fields + verified grant project IDs.
 * Does not infer Observer / open-peer access from status alone.
 */
export function classifyMyWorkListAccess(input: {
  userId: number;
  assignmentStatus: string;
  assignedUserId: number | null | undefined;
  peerCheckerId: number | null | undefined;
  projectId: number;
  grantProjectIds: readonly number[];
  translatorProjectIds?: readonly number[];
}): MyWorkListAccess | null {
  if (!isPositiveInteger(input.userId) || !isPositiveInteger(input.projectId)) {
    return null;
  }

  const status = normalizeStatus(input.assignmentStatus);

  if (
    (status === MY_WORK_CHAPTER_STATUSES.NOT_STARTED ||
      status === MY_WORK_CHAPTER_STATUSES.DRAFT) &&
    input.assignedUserId === input.userId
  ) {
    return 'assigned';
  }

  if (
    status === MY_WORK_CHAPTER_STATUSES.PEER_CHECK &&
    input.peerCheckerId === input.userId
  ) {
    return 'assigned';
  }

  const translatorIds = normalizeMyWorkGrantProjectIds(
    input.translatorProjectIds,
  );
  if (
    isEligibleOpenPeerCheckNonDrafter(
      {
        status: input.assignmentStatus,
        assignedUserId: input.assignedUserId ?? undefined,
        peerCheckerId: input.peerCheckerId ?? undefined,
      },
      input.userId,
    ) &&
    translatorIds.includes(input.projectId)
  ) {
    return 'open_peer';
  }

  const grantIds = normalizeMyWorkGrantProjectIds(input.grantProjectIds);
  if (
    isMyWorkObserverReviewStatus(status) &&
    grantIds.includes(input.projectId)
  ) {
    return 'observer';
  }

  return null;
}
