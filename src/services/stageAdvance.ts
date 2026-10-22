import { updateChapterAssignmentStatusLocally } from '../db/repository';
import type { StageAdvanceDestination } from '../utils/stageAdvancement';

/**
 * Apply the stage change locally and enqueue it. Drain sends the PATCH.
 * The Record tab returns after this function; it does not wait on the server.
 */
export async function confirmStageAdvancement(params: {
  chapterAssignmentId: number;
  destination: StageAdvanceDestination;
  assignPeerCheckerId?: number;
  userId: number;
}): Promise<void> {
  const { chapterAssignmentId, destination, assignPeerCheckerId, userId } =
    params;

  await updateChapterAssignmentStatusLocally(
    chapterAssignmentId,
    destination.nextStatus,
    assignPeerCheckerId,
    userId,
  );
}
