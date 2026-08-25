import type { ChapterAssignmentData } from '../types/db/types';

/** True when someone else holds an assignee slot and the current user holds neither. */
export function isChapterTakenByOther(
  chapterData: ChapterAssignmentData,
  currentUserId: number | null,
): boolean {
  if (currentUserId === null) {
    return false;
  }

  const iAmAssigned =
    chapterData.assignedUserId === currentUserId ||
    chapterData.peerCheckerId === currentUserId;
  if (iAmAssigned) {
    return false;
  }

  return (
    typeof chapterData.assignedUserId === 'number' ||
    typeof chapterData.peerCheckerId === 'number'
  );
}
