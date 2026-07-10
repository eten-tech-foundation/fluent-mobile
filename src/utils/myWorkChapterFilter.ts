export const MY_WORK_CHAPTER_STATUSES = {
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  PEER_CHECK: 'peer_check',
} as const;

/** SQL predicate for My Work: not_started/draft-as-assignee OR peer_check-as-peer-checker. */
export const MY_WORK_CHAPTER_WHERE = `(ca.status IN (?, ?) AND ca.assigned_user_id = ?)
  OR (ca.status = ? AND ca.peer_checker_id = ?)`;

export function getMyWorkChapterQueryParams(
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
