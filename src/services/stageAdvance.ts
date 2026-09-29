import { FluentAPI } from './api';
import { updateChapterAssignmentStatusLocally } from '../db/repository';
import { logger } from '../utils/logger';
import type { StageAdvanceDestination } from '../utils/stageAdvancement';

const log = logger.create('stageAdvance');

/**
 * Apply stage advancement locally immediately, then best-effort PATCH submit
 * when the server is reachable. Offline queue persistence is #257.
 */
export async function confirmStageAdvancement(params: {
  chapterAssignmentId: number;
  destination: StageAdvanceDestination;
  assignPeerCheckerId?: number;
}): Promise<void> {
  const { chapterAssignmentId, destination, assignPeerCheckerId } = params;

  await updateChapterAssignmentStatusLocally(
    chapterAssignmentId,
    destination.nextStatus,
    assignPeerCheckerId,
  );

  try {
    const reachable = await FluentAPI.checkServerReachable();
    if (!reachable) {
      log.info('Offline after local stage advance; sync deferred to #257', {
        chapterAssignmentId,
        nextStatus: destination.nextStatus,
      });
      return;
    }
    await FluentAPI.submitChapterAssignment(chapterAssignmentId);
  } catch (error) {
    log.warn('Stage submit failed after local update; queue deferred to #257', {
      chapterAssignmentId,
      error,
    });
  }
}
