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

/** Assigned/peer predicate only (no Observer branch). */
export const MY_WORK_ASSIGNED_CHAPTER_WHERE = `(ca.status IN (?, ?) AND ca.assigned_user_id = ?)
  OR (ca.status = ? AND ca.peer_checker_id = ?)`;

/** Assigned-only WHERE fragment (no Observer IN-list). */
export const MY_WORK_CHAPTER_WHERE = MY_WORK_ASSIGNED_CHAPTER_WHERE;

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

/**
 * Build My Work WHERE + bindings.
 * Assigned/peer rows unchanged; Observer review statuses only when
 * `grantProjectIds` is non-empty, matched via `pu.project_id`, with
 * `user_projects` membership for the same user + project.
 */
export function buildMyWorkChapterFilter(
  userId: number,
  grantProjectIds?: readonly number[],
): { whereSql: string; params: (string | number)[] } {
  const assignedParams = getMyWorkAssignedChapterQueryParams(userId);
  const projectIds = normalizeMyWorkGrantProjectIds(grantProjectIds);

  if (projectIds.length === 0) {
    return {
      whereSql: `(${MY_WORK_ASSIGNED_CHAPTER_WHERE})`,
      params: assignedParams,
    };
  }

  const statusPlaceholders = MY_WORK_OBSERVER_REVIEW_STATUSES.map(
    () => '?',
  ).join(', ');
  const projectPlaceholders = projectIds.map(() => '?').join(', ');

  const observerWhere = `(
    ca.status IN (${statusPlaceholders})
    AND pu.project_id IN (${projectPlaceholders})
    AND EXISTS (
      SELECT 1
      FROM user_projects up
      WHERE up.user_id = ?
        AND up.project_id = pu.project_id
    )
  )`;

  return {
    whereSql: `(${MY_WORK_ASSIGNED_CHAPTER_WHERE}) OR ${observerWhere}`,
    params: [
      ...assignedParams,
      ...MY_WORK_OBSERVER_REVIEW_STATUSES,
      ...projectIds,
      userId,
    ],
  };
}

/**
 * Classify list access from live assignment fields + verified grant project IDs.
 * Does not infer Observer access from status alone.
 */
export function classifyMyWorkListAccess(input: {
  userId: number;
  assignmentStatus: string;
  assignedUserId: number | null | undefined;
  peerCheckerId: number | null | undefined;
  projectId: number;
  grantProjectIds: readonly number[];
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

  const grantIds = normalizeMyWorkGrantProjectIds(input.grantProjectIds);
  if (
    isMyWorkObserverReviewStatus(status) &&
    grantIds.includes(input.projectId)
  ) {
    return 'observer';
  }

  return null;
}
