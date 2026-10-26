import { FluentAPI } from './api';
import { authToken } from './authToken';
import { markChapterCompleteConfirmed } from '../utils/chapterCompletionSyncGuard';
import { updateChapterAssignmentStatusLocally } from '../db/repository';
import { logger } from '../utils/logger';
import type { StageAdvanceDestination } from '../utils/stageAdvancement';

const log = logger.create('stageAdvance');

/**
 * Apply stage advancement locally immediately, then best-effort PATCH submit
 * when the server is reachable. Complete requires server confirmation first.
 * Offline queue persistence for earlier stages is #257.
 */
export async function confirmStageAdvancement(params: {
  chapterAssignmentId: number;
  destination: StageAdvanceDestination;
  assignPeerCheckerId?: number;
}): Promise<void> {
  const { chapterAssignmentId, destination, assignPeerCheckerId } = params;

  if (destination.nextStatus === 'complete') {
    const token = authToken.get();
    if (!token) throw new Error('Sign in before completing this chapter');
    // Complete is terminal: do not display it until the server confirms it.
    // A retry after an interrupted response must not submit another transition.
    const current = await FluentAPI.getChapterAssignment(
      chapterAssignmentId,
      token,
    );
    if (current.chapterAssignmentId !== chapterAssignmentId) {
      throw new Error('Could not verify this chapter');
    }
    const status = current.status ?? current.chapterStatus;
    if (status !== 'complete') {
      if (status !== 'consultant_check') {
        throw new Error('Chapter stage changed. Sync and try again.');
      }
      await FluentAPI.submitChapterAssignment(chapterAssignmentId, token);
      const confirmed = await FluentAPI.getChapterAssignment(
        chapterAssignmentId,
        token,
      );
      if (
        confirmed.chapterAssignmentId !== chapterAssignmentId ||
        (confirmed.status ?? confirmed.chapterStatus) !== 'complete'
      ) {
        throw new Error('Server has not confirmed Complete. Please try again.');
      }
    }
    markChapterCompleteConfirmed(chapterAssignmentId);
    await updateChapterAssignmentStatusLocally(
      chapterAssignmentId,
      destination.nextStatus,
      assignPeerCheckerId,
    );
    return;
  }

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
