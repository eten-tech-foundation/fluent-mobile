import {
  deleteStageAdvanceQueueEntry,
  getPendingStageAdvances,
  type PendingStageAdvance,
} from '../db/stageAdvanceQueueRepository';
import { setChapterAssignmentStatus } from '../db/repository';
import { isApiError } from '../types/api/errors';
import type { ApiChapterAssignment } from '../types/api/types';
import { isAuthError } from './authError';
import { FluentAPI } from './api';
import { isStageAhead, pickLowerStageStatus } from '../utils/workflowStage';

export type SyncPendingStageAdvancesResult = {
  synced: number;
  dropped: number;
  failed: number;
};

let inFlight: Promise<SyncPendingStageAdvancesResult> | null = null;

export function __resetStageAdvanceSyncForTests(): void {
  inFlight = null;
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function readServerStatus(
  assignment: ApiChapterAssignment,
): string | undefined {
  const raw = assignment.status ?? assignment.chapterStatus;
  if (raw === null || raw === undefined) return undefined;
  return normalizeStatus(raw);
}

async function dropResolved(
  row: PendingStageAdvance,
  serverStatus: string,
): Promise<void> {
  const toStatus = normalizeStatus(row.toStatus);
  if (isStageAhead(serverStatus, toStatus)) {
    await setChapterAssignmentStatus(
      row.chapterAssignmentId,
      pickLowerStageStatus(serverStatus, toStatus),
    );
  }
  await deleteStageAdvanceQueueEntry(row.id);
}

/**
 * Push pending stage advances for one user. GET before every PATCH, including
 * a retry of a row left pending. A second overlapping call joins this pass.
 */
export async function syncPendingStageAdvances(
  userId: number,
  token?: string,
): Promise<SyncPendingStageAdvancesResult> {
  if (inFlight) return inFlight;
  inFlight = drainStageAdvances(userId, token).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function drainStageAdvances(
  userId: number,
  token?: string,
): Promise<SyncPendingStageAdvancesResult> {
  const pending = await getPendingStageAdvances();
  let synced = 0;
  let dropped = 0;
  let failed = 0;

  for (const row of pending) {
    if (row.userId !== userId) continue;

    let serverStatus: string | undefined;
    try {
      const assignment = await FluentAPI.getChapterAssignment(
        row.chapterAssignmentId,
        token,
      );
      serverStatus = readServerStatus(assignment);
    } catch (error) {
      if (isAuthError(error)) throw error;
      failed += 1;
      continue;
    }

    const fromStatus = normalizeStatus(row.fromStatus);
    const toStatus = normalizeStatus(row.toStatus);

    if (serverStatus === undefined) {
      failed += 1;
      continue;
    }

    if (serverStatus === toStatus) {
      try {
        await deleteStageAdvanceQueueEntry(row.id);
        dropped += 1;
      } catch {
        failed += 1;
      }
      continue;
    }

    if (isStageAhead(serverStatus, toStatus)) {
      try {
        await dropResolved(row, serverStatus);
        dropped += 1;
      } catch (error) {
        if (isAuthError(error)) throw error;
        failed += 1;
      }
      continue;
    }

    if (serverStatus !== fromStatus) {
      failed += 1;
      continue;
    }

    try {
      await FluentAPI.submitChapterAssignment(row.chapterAssignmentId, token);
    } catch (error) {
      if (isAuthError(error)) throw error;
      if (isApiError(error) && error.status === 400) {
        try {
          const again = await FluentAPI.getChapterAssignment(
            row.chapterAssignmentId,
            token,
          );
          const after = readServerStatus(again);
          if (
            after !== undefined &&
            (after === toStatus || isStageAhead(after, toStatus))
          ) {
            await dropResolved(row, after);
            dropped += 1;
            continue;
          }
        } catch (followUp) {
          if (isAuthError(followUp)) throw followUp;
        }
      }
      failed += 1;
      continue;
    }

    try {
      await deleteStageAdvanceQueueEntry(row.id);
      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return { synced, dropped, failed };
}
