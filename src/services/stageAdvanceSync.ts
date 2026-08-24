import { getChapterAssignmentById } from '../db/queries';
import {
  listPendingStageAdvances,
  removeStageAdvanceQueueItem,
  type StageAdvanceQueueItem,
} from '../db/stageAdvanceQueueRepository';
import { resolveStageAdvanceConflictLocally } from '../db/repository';
import { isApiError } from '../types/api/errors';
import type { ApiChapterAssignment } from '../types/api/types';
import { pickLowerStageStatus } from '../utils/workflowStage';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { mapApiChapterAssignment } from './mapChapterAssignment';
import { getActiveUserId } from './storage';

const log = logger.create('StageAdvanceSync');

function findAssignmentInUserWork(
  response: {
    assignedChapters?: ApiChapterAssignment[];
    peerCheckChapters?: ApiChapterAssignment[];
  },
  chapterAssignmentId: number,
): ApiChapterAssignment | undefined {
  const all = [
    ...(response.assignedChapters ?? []),
    ...(response.peerCheckChapters ?? []),
  ];
  return all.find(a => a.chapterAssignmentId === chapterAssignmentId);
}

/**
 * After a terminal submit rejection, re-pull the assignment and keep the lower
 * stage silently (#257). Clears all queued advances for that assignment.
 */
async function resolveRejectedStageAdvance(
  item: StageAdvanceQueueItem,
): Promise<void> {
  const userId = Number(getActiveUserId());
  let serverStatus: string | undefined;
  let serverSubmittedTime: string | null | undefined;

  if (Number.isFinite(userId) && userId > 0) {
    try {
      const response = await FluentAPI.getUserChapterAssignments(userId);
      const match = findAssignmentInUserWork(
        response,
        item.chapterAssignmentId,
      );
      if (match) {
        const mapped = mapApiChapterAssignment(match);
        serverStatus = mapped.chapterStatus;
        serverSubmittedTime = mapped.submittedTime ?? null;
      }
    } catch (error) {
      log.warn('Failed to re-pull assignment after stage reject', {
        chapterAssignmentId: item.chapterAssignmentId,
        error,
      });
    }
  }

  const local = await getChapterAssignmentById(item.chapterAssignmentId);
  const localStatus = local?.status ?? item.targetStatus;
  const resolved = pickLowerStageStatus(localStatus, serverStatus);
  const normalizedServer = (serverStatus ?? '').trim().toLowerCase();
  const keepServer =
    normalizedServer.length > 0 && resolved === normalizedServer;

  await resolveStageAdvanceConflictLocally(
    item.chapterAssignmentId,
    resolved,
    keepServer ? serverSubmittedTime ?? null : local?.submittedTime ?? null,
  );

  log.info('Resolved stage advance conflict by keeping lower stage', {
    chapterAssignmentId: item.chapterAssignmentId,
    localStatus,
    serverStatus,
    resolved,
  });
}

/**
 * Drain the stage-advance queue in FIFO order.
 * Call before audio uploads on reconnect / Sync Now (#257).
 */
export async function syncPendingStageAdvances(): Promise<void> {
  const pending = await listPendingStageAdvances();
  if (pending.length === 0) {
    return;
  }

  log.info('Syncing pending stage advances', { count: pending.length });

  const clearedAssignments = new Set<number>();

  for (const item of pending) {
    if (clearedAssignments.has(item.chapterAssignmentId)) {
      continue;
    }

    try {
      await FluentAPI.submitChapterAssignment(item.chapterAssignmentId);
      await removeStageAdvanceQueueItem(item.id);
      log.info('Stage advance submitted', {
        queueId: item.id,
        chapterAssignmentId: item.chapterAssignmentId,
        targetStatus: item.targetStatus,
      });
    } catch (error) {
      if (isAuthError(error)) {
        log.warn('Stage advance sync stopped on auth error; queue retained', {
          queueId: item.id,
          chapterAssignmentId: item.chapterAssignmentId,
        });
        return;
      }
      if (isApiError(error) && error.isTerminal) {
        await resolveRejectedStageAdvance(item);
        clearedAssignments.add(item.chapterAssignmentId);
        continue;
      }
      log.warn('Stage advance sync stopped; remaining items stay queued', {
        queueId: item.id,
        chapterAssignmentId: item.chapterAssignmentId,
        error,
      });
      return;
    }
  }
}
