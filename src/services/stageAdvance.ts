import { FluentAPI } from './api';
import { applyLocalStageAdvanceAndEnqueue } from '../db/repository';
import { logger } from '../utils/logger';
import type { StageAdvanceDestination } from '../utils/stageAdvancement';
import { syncPendingStageAdvances } from './stageAdvanceSync';

const log = logger.create('stageAdvance');

/**
 * Apply stage advancement locally immediately and enqueue for offline sync
 * (#257), then best-effort drain the queue when the server is reachable.
 */
export async function confirmStageAdvancement(params: {
  chapterAssignmentId: number;
  destination: StageAdvanceDestination;
}): Promise<void> {
  const { chapterAssignmentId, destination } = params;

  await applyLocalStageAdvanceAndEnqueue(
    chapterAssignmentId,
    destination.nextStatus,
  );

  try {
    const reachable = await FluentAPI.checkServerReachable();
    if (!reachable) {
      log.info('Offline after local stage advance; left in queue', {
        chapterAssignmentId,
        nextStatus: destination.nextStatus,
      });
      return;
    }
    await syncPendingStageAdvances();
  } catch (error) {
    log.warn('Stage queue drain failed after local update; left queued', {
      chapterAssignmentId,
      error,
    });
  }
}
