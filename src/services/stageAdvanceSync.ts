import {
  deleteStageAdvanceQueueEntry,
  getPendingStageAdvances,
  type PendingStageAdvance,
} from '../db/stageAdvanceQueueRepository';
import { assignmentHasPendingUploads } from '../db/queries';
import { setChapterAssignmentStatus } from '../db/repository';
import { logger } from '../utils/logger';
import { isApiError } from '../types/api/errors';
import type { ApiChapterAssignment } from '../types/api/types';
import { isAuthError } from './authError';
import { FluentAPI } from './api';
import {
  getWorkflowStage,
  isStageAhead,
  pickLowerStageStatus,
} from '../utils/workflowStage';

const log = logger.create('StageAdvanceSync');

export type SyncPendingStageAdvancesResult = {
  synced: number;
  dropped: number;
  failed: number;
};

const inFlight = new Map<number, Promise<SyncPendingStageAdvancesResult>>();
// A call that joins a pass already in flight may have been triggered after that
// pass read its state (e.g. takes just finished uploading). Run one more pass.
const rerunRequested = new Set<number>();

export function __resetStageAdvanceSyncForTests(): void {
  inFlight.clear();
  rerunRequested.clear();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function readServerStatus(
  assignment: ApiChapterAssignment,
): string | undefined {
  const raw = assignment.status ?? assignment.chapterStatus;
  if (typeof raw !== 'string') return undefined;
  const normalized = normalizeStatus(raw);
  // An empty status is not a stage the server confirmed; do not write it locally.
  return normalized === '' ? undefined : normalized;
}

async function dropResolved(
  row: PendingStageAdvance,
  serverStatus: string,
): Promise<void> {
  const toStatus = normalizeStatus(row.toStatus);
  await setChapterAssignmentStatus(
    row.chapterAssignmentId,
    pickLowerStageStatus(serverStatus, toStatus),
  );
  await deleteStageAdvanceQueueEntry(row.id);
}

/**
 * Push pending stage advances for one user. GET before every PATCH, including
 * a retry of a row left pending. Overlapping calls for the same user join the
 * pass in flight, which then runs once more so the joiner's trigger is not
 * answered with a stale read; different users drain independently.
 */
export async function syncPendingStageAdvances(
  userId: number,
  token?: string,
): Promise<SyncPendingStageAdvancesResult> {
  const existing = inFlight.get(userId);
  if (existing) {
    rerunRequested.add(userId);
    return existing;
  }
  const pass = runDrainPasses(userId, token).finally(() => {
    rerunRequested.delete(userId);
    inFlight.delete(userId);
  });
  inFlight.set(userId, pass);
  return pass;
}

async function runDrainPasses(
  userId: number,
  token?: string,
): Promise<SyncPendingStageAdvancesResult> {
  const total = await drainStageAdvances(userId, token);
  while (rerunRequested.delete(userId)) {
    const next = await drainStageAdvances(userId, token);
    total.synced += next.synced;
    total.dropped += next.dropped;
    total.failed += next.failed;
  }
  return total;
}

async function drainStageAdvances(
  userId: number,
  token?: string,
): Promise<SyncPendingStageAdvancesResult> {
  const pending = await getPendingStageAdvances();
  let synced = 0;
  let dropped = 0;
  let failed = 0;
  const holdAssignmentIds = new Set<number>();

  for (const row of pending) {
    if (row.userId !== userId) continue;
    if (holdAssignmentIds.has(row.chapterAssignmentId)) continue;

    const holdRest = (): void => {
      // Later chained rows (same assignment, later from/to) stay pending.
      holdAssignmentIds.add(row.chapterAssignmentId);
    };

    let serverStatus: string | undefined;
    try {
      const assignment = await FluentAPI.getChapterAssignment(
        row.chapterAssignmentId,
        token,
      );
      serverStatus = readServerStatus(assignment);
    } catch (error) {
      if (isAuthError(error)) throw error;
      log.warn('Leaving stage advance pending: GET assignment failed', {
        chapterAssignmentId: row.chapterAssignmentId,
        error: errorMessage(error),
      });
      failed += 1;
      holdRest();
      continue;
    }

    const fromStatus = normalizeStatus(row.fromStatus);
    const toStatus = normalizeStatus(row.toStatus);

    if (serverStatus === undefined) {
      log.warn('Leaving stage advance pending: server status missing', {
        chapterAssignmentId: row.chapterAssignmentId,
        fromStatus,
        toStatus,
      });
      failed += 1;
      holdRest();
      continue;
    }

    if (serverStatus === toStatus) {
      try {
        await deleteStageAdvanceQueueEntry(row.id);
        dropped += 1;
      } catch (error) {
        log.warn('Stage advance row delete failed; leaving pending', {
          chapterAssignmentId: row.chapterAssignmentId,
          error: errorMessage(error),
        });
        failed += 1;
        holdRest();
      }
      continue;
    }

    if (isStageAhead(serverStatus, toStatus)) {
      try {
        await dropResolved(row, serverStatus);
        dropped += 1;
      } catch (error) {
        if (isAuthError(error)) throw error;
        log.warn('Stage advance keep-higher drop failed; leaving pending', {
          chapterAssignmentId: row.chapterAssignmentId,
          error: errorMessage(error),
        });
        failed += 1;
        holdRest();
      }
      continue;
    }

    if (serverStatus !== fromStatus) {
      // Server behind `from`: keep-lower and drop.
      if (isStageAhead(fromStatus, serverStatus)) {
        try {
          log.info('Server is behind the queued from-status; keeping lower', {
            chapterAssignmentId: row.chapterAssignmentId,
            fromStatus,
            toStatus,
            serverStatus,
          });
          await dropResolved(row, serverStatus);
          dropped += 1;
        } catch (error) {
          if (isAuthError(error)) throw error;
          log.warn('Stage advance keep-lower drop failed; leaving pending', {
            chapterAssignmentId: row.chapterAssignmentId,
            error: errorMessage(error),
          });
          failed += 1;
          holdRest();
        }
        continue;
      }
      // Unknown/unexpected status: leave pending so a later GET can still
      // PATCH (#257 / review).
      if (
        getWorkflowStage(serverStatus) === null ||
        getWorkflowStage(fromStatus) === null
      ) {
        log.warn('Leaving stage advance pending: unrecognized stage', {
          chapterAssignmentId: row.chapterAssignmentId,
          fromStatus,
          toStatus,
          serverStatus,
        });
        failed += 1;
        holdRest();
        continue;
      }
      // Otherwise the server moved forward from `from` but is still short of
      // `to` (e.g. a new chapter queued not_started → peer_check; claim and
      // takes upload moved it to draft). Continue to the PATCH from there.
    }

    if (await assignmentHasPendingUploads(row.chapterAssignmentId, userId)) {
      log.info('Holding stage advance until chapter uploads finish', {
        chapterAssignmentId: row.chapterAssignmentId,
        userId,
      });
      holdRest();
      continue;
    }

    let patched: Awaited<ReturnType<typeof FluentAPI.submitChapterAssignment>>;
    try {
      patched = await FluentAPI.submitChapterAssignment(
        row.chapterAssignmentId,
        token,
      );
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
      log.warn('Stage advance PATCH failed; leaving pending', {
        chapterAssignmentId: row.chapterAssignmentId,
        fromStatus,
        toStatus,
        serverStatus,
        status: isApiError(error) ? error.status : undefined,
      });
      failed += 1;
      holdRest();
      continue;
    }

    // One PATCH may advance only a single stage. If the response shows a known
    // stage still below the target, keep the row so the next pass PATCHes again
    // instead of deleting it and letting a pull revert the local advance.
    const patchedStatus =
      patched !== null && typeof patched === 'object'
        ? readServerStatus(patched as ApiChapterAssignment)
        : undefined;
    if (patchedStatus !== undefined && isStageAhead(toStatus, patchedStatus)) {
      log.warn('Stage advance PATCH landed below the target; leaving pending', {
        chapterAssignmentId: row.chapterAssignmentId,
        fromStatus,
        toStatus,
        patchedStatus,
      });
      failed += 1;
      holdRest();
      continue;
    }

    try {
      await deleteStageAdvanceQueueEntry(row.id);
      synced += 1;
    } catch (error) {
      log.warn('Stage advance row delete failed; leaving pending', {
        chapterAssignmentId: row.chapterAssignmentId,
        error: errorMessage(error),
      });
      failed += 1;
      holdRest();
    }
  }

  return { synced, dropped, failed };
}
