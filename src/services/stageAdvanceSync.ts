import { getChapterAssignmentById } from '../db/queries';
import {
  listPendingStageAdvances,
  removeStageAdvanceQueueItem,
  type StageAdvanceQueueItem,
} from '../db/stageAdvanceQueueRepository';
import { resolveStageAdvanceConflictLocally } from '../db/repository';
import { isApiError } from '../types/api/errors';
import type { ApiChapterAssignment } from '../types/api/types';
import type { UserChapterAssignmentsResponse } from '../types/api/responses';
import { pickLowerStageStatus } from '../utils/workflowStage';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { mapApiChapterAssignment } from './mapChapterAssignment';
import { getActiveUserId } from './storage';

const log = logger.create('StageAdvanceSync');

let drainInFlight: Promise<void> | null = null;

function findAssignmentInUserWork(
  response: UserChapterAssignmentsResponse,
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
 * stage silently (#257). Returns false when server status could not be obtained
 * so the queue item stays for a later drain.
 */
async function resolveRejectedStageAdvance(
  item: StageAdvanceQueueItem,
): Promise<boolean> {
  const userId = Number(getActiveUserId());
  if (!Number.isFinite(userId) || userId <= 0) {
    log.warn(
      'Cannot resolve stage reject without active user; queue retained',
      {
        chapterAssignmentId: item.chapterAssignmentId,
      },
    );
    return false;
  }

  let serverStatus: string | undefined;
  let serverSubmittedTime: string | null | undefined;

  try {
    const response = await FluentAPI.getUserChapterAssignments(userId);
    const match = findAssignmentInUserWork(response, item.chapterAssignmentId);
    if (match) {
      const mapped = mapApiChapterAssignment(match);
      serverStatus = mapped.chapterStatus;
      serverSubmittedTime = mapped.submittedTime ?? null;
    }
  } catch (error) {
    log.warn(
      'Failed to re-pull assignment after stage reject; queue retained',
      {
        chapterAssignmentId: item.chapterAssignmentId,
        error,
      },
    );
    return false;
  }

  if (serverStatus === undefined) {
    log.warn(
      'Assignment missing from re-pull after stage reject; queue retained',
      { chapterAssignmentId: item.chapterAssignmentId },
    );
    return false;
  }

  const local = await getChapterAssignmentById(item.chapterAssignmentId);
  const localStatus = local?.status ?? item.targetStatus;
  const resolved = pickLowerStageStatus(localStatus, serverStatus);
  const normalizedServer = serverStatus.trim().toLowerCase();
  const keepServer = resolved === normalizedServer;

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
  return true;
}

async function drainPendingStageAdvances(): Promise<void> {
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
        const resolved = await resolveRejectedStageAdvance(item);
        if (!resolved) {
          log.warn(
            'Stage conflict unresolved; stopping drain with queue retained',
            {
              queueId: item.id,
              chapterAssignmentId: item.chapterAssignmentId,
            },
          );
          return;
        }
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

/**
 * Drain the stage-advance queue in FIFO order.
 * Call before audio uploads on reconnect / Sync Now (#257).
 * Re-entrant: concurrent callers share the in-flight drain.
 */
export async function syncPendingStageAdvances(): Promise<void> {
  if (drainInFlight) {
    return drainInFlight;
  }

  drainInFlight = drainPendingStageAdvances().finally(() => {
    drainInFlight = null;
  });

  return drainInFlight;
}
