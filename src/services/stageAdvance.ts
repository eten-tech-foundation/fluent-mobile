import { FluentAPI } from './api';
import { authToken } from './authToken';
import { markChapterCompleteConfirmed } from '../utils/chapterCompletionSyncGuard';
import {
  setChapterAssignmentStatus,
  updateChapterAssignmentStatusLocally,
} from '../db/repository';
import type { StageAdvanceDestination } from '../utils/stageAdvancement';
import { normalizeChapterStatus } from './mapChapterAssignment';

/**
 * Apply the stage change locally and enqueue it. Drain sends the PATCH.
 * Complete is terminal: confirm on the server first, then write locally
 * without enqueueing (submit already happened or was unnecessary).
 */
export async function confirmStageAdvancement(params: {
  chapterAssignmentId: number;
  destination: StageAdvanceDestination;
  assignPeerCheckerId?: number;
  userId: number;
}): Promise<void> {
  const { chapterAssignmentId, destination, assignPeerCheckerId, userId } =
    params;

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
    const status = normalizeChapterStatus(
      current.chapterStatus ?? current.status,
    );
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
        normalizeChapterStatus(confirmed.chapterStatus ?? confirmed.status) !==
          'complete'
      ) {
        throw new Error('Server has not confirmed Complete. Please try again.');
      }
    }
    markChapterCompleteConfirmed(chapterAssignmentId);
    // Server already has Complete — write local status without a queue row.
    await setChapterAssignmentStatus(chapterAssignmentId, 'complete');
    return;
  }

  await updateChapterAssignmentStatusLocally(
    chapterAssignmentId,
    destination.nextStatus,
    assignPeerCheckerId,
    userId,
  );
}
