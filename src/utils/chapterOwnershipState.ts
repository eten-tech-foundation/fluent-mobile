export type ChapterOwnershipState = 'unassigned' | 'mine' | 'other';

export function deriveChapterOwnershipState(
  assignedUserId: number | null | undefined,
  currentUserId: number | null,
): ChapterOwnershipState {
  if (assignedUserId === null || assignedUserId === undefined)
    return 'unassigned';
  if (currentUserId !== null && assignedUserId === currentUserId) return 'mine';
  return 'other';
}
