import type { ChapterAssignmentData } from '../types/db/types';

/** True when someone else holds an exclusive assignee slot the current user does not. */
export function isChapterTakenByOther(
  chapterData: ChapterAssignmentData,
  currentUserId: number | null,
): boolean {
  if (currentUserId === null) {
    return false;
  }

  const status = (chapterData.status ?? '').trim().toLowerCase();
  // Unassigned Peer Check is open: drafter slot must not banner other peers.
  if (
    status === 'peer_check' &&
    typeof chapterData.peerCheckerId !== 'number'
  ) {
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
