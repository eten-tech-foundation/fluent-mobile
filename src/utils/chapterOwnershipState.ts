import { getWorkflowStage } from './workflowStage';
import { ChapterOwnershipState } from '../types/db/types';

export function deriveChapterOwnershipState(
  assignedUserId: number | null | undefined,
  currentUserId: number | null,
): ChapterOwnershipState {
  if (assignedUserId === null || assignedUserId === undefined)
    return 'unassigned';
  if (currentUserId !== null && assignedUserId === currentUserId) return 'mine';
  return 'other';
}

export function resolveStageAssigneeId(
  status: string | null | undefined,
  assignedUserId: number | null | undefined,
  peerCheckerId: number | null | undefined,
): number | null | undefined {
  const stage = getWorkflowStage(status);
  switch (stage) {
    case 'draft':
    case 'not_started':
      return assignedUserId;
    case 'peer_check':
      return peerCheckerId;
    default:
      return null;
  }
}
