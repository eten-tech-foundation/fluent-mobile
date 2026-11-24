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
  /**
   * This drain's rows left pending behind an earlier stage change it could not
   * send (another account's, or an account that must sign in again). Not a
   * failure: they go once the earlier change lands (#854).
   */
  blocked: number;
};

type DrainOptions = {
  /**
   * Multi-account drains only: called when an account's token is rejected.
   * That account's rows stay pending instead of the 401 ending the drain for
   * every other account (#854).
   */
  onOwnerAuthFailure?: (userId: number) => void;
};

const inFlight = new Map<string, Promise<SyncPendingStageAdvancesResult>>();
// A call that joins a pass already in flight may have been triggered after that
// pass read its state (e.g. takes just finished uploading). Run one more pass.
const rerunRequested = new Set<string>();
/** Settles when the last queued drain finishes; null when none is running. */
let drainLock: Promise<unknown> | null = null;

export function __resetStageAdvanceSyncForTests(): void {
  inFlight.clear();
  rerunRequested.clear();
  drainLock = null;
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
 * answered with a stale read. Drains for different users run one after
 * another, never at the same time (#854).
 *
 * Another account's earlier queued row on the same chapter holds this user's
 * row (`blocked`), so a single-user drain can never send a later stage change
 * ahead of an earlier one from this device (#854).
 */
export async function syncPendingStageAdvances(
  userId: number,
  token?: string,
): Promise<SyncPendingStageAdvancesResult> {
  return runSingleFlight(new Map([[userId, token]]), {});
}

/**
 * Push every listed account's pending stage advances in queue order, each with
 * that account's own token (#854). A row from an account not listed (no stored
 * session) holds later rows on its chapter. An account whose token is rejected
 * is reported through `onOwnerAuthFailure` and its rows stay pending; the
 * other accounts keep draining.
 */
export async function drainStageAdvancesForAccounts(
  tokens: ReadonlyMap<number, string>,
  onOwnerAuthFailure: (userId: number) => void,
): Promise<SyncPendingStageAdvancesResult> {
  return runSingleFlight(tokens, { onOwnerAuthFailure });
}

function runSingleFlight(
  tokens: ReadonlyMap<number, string | undefined>,
  options: DrainOptions,
): Promise<SyncPendingStageAdvancesResult> {
  // Single-user and multi-account drains handle a 401 differently (rethrow vs
  // absorb), so a caller only joins a drain of its own mode.
  const key = `${options.onOwnerAuthFailure ? 'multi' : 'single'}:${[
    ...tokens.keys(),
  ]
    .sort((a, b) => a - b)
    .join(',')}`;
  const existing = inFlight.get(key);
  if (existing) {
    rerunRequested.add(key);
    return existing;
  }
  // Drains with different keys can touch the same rows (a multi-account drain
  // covers every single-user one). Submit advances whatever stage the server
  // is on, so two drains sending one row would move the chapter twice (#854).
  // Run every drain one at a time behind a single lock.
  const run = () => runDrainPasses(key, tokens, options);
  const pass = (drainLock ? drainLock.then(run) : run()).finally(() => {
    rerunRequested.delete(key);
    inFlight.delete(key);
    if (drainLock === settled) drainLock = null;
  });
  const settled = pass.catch(() => undefined);
  drainLock = settled;
  inFlight.set(key, pass);
  return pass;
}

async function runDrainPasses(
  key: string,
  tokens: ReadonlyMap<number, string | undefined>,
  options: DrainOptions,
): Promise<SyncPendingStageAdvancesResult> {
  let total = await drainStageAdvances(tokens, options);
  while (rerunRequested.delete(key)) {
    const next = await drainStageAdvances(tokens, options);
    total = {
      synced: total.synced + next.synced,
      dropped: total.dropped + next.dropped,
      failed: total.failed + next.failed,
      // Rows still blocked after the last pass, not a running sum.
      blocked: next.blocked,
    };
  }
  return total;
}

async function drainStageAdvances(
  tokens: ReadonlyMap<number, string | undefined>,
  options: DrainOptions,
): Promise<SyncPendingStageAdvancesResult> {
  const pending = await getPendingStageAdvances();
  let synced = 0;
  let dropped = 0;
  let failed = 0;
  let blocked = 0;
  const holdAssignmentIds = new Set<number>();
  // Chapters with an earlier queued stage change this drain cannot send (another
  // account's, or one whose session expired). A later row on the same chapter
  // waits for it: sending it first would find the server a stage behind and
  // the keep-lower rule would silently drop it (#854 / #847).
  const blockedAssignmentIds = new Set<number>();
  const signInRequiredOwners = new Set<number>();

  for (const row of pending) {
    const token = tokens.get(row.userId);
    if (!tokens.has(row.userId) || signInRequiredOwners.has(row.userId)) {
      // That account's own rows wait for it to sign in (the Sync page says
      // so); only other accounts' rows held behind them count as `blocked`.
      blockedAssignmentIds.add(row.chapterAssignmentId);
      continue;
    }
    if (blockedAssignmentIds.has(row.chapterAssignmentId)) {
      log.info('Holding stage advance behind an earlier one on this device', {
        chapterAssignmentId: row.chapterAssignmentId,
        userId: row.userId,
      });
      blocked += 1;
      continue;
    }
    if (holdAssignmentIds.has(row.chapterAssignmentId)) continue;

    const holdRest = (): void => {
      // Later chained rows (same assignment, later from/to) stay pending.
      holdAssignmentIds.add(row.chapterAssignmentId);
    };

    try {
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

      // Only this row's own account's takes hold it: holding on every
      // account's takes would deadlock with takes waiting on this row (#854).
      if (
        await assignmentHasPendingUploads(row.chapterAssignmentId, row.userId)
      ) {
        log.info('Holding stage advance until chapter uploads finish', {
          chapterAssignmentId: row.chapterAssignmentId,
          userId: row.userId,
        });
        holdRest();
        continue;
      }

      let patched: Awaited<
        ReturnType<typeof FluentAPI.submitChapterAssignment>
      >;
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
      if (
        patchedStatus !== undefined &&
        isStageAhead(toStatus, patchedStatus)
      ) {
        log.warn(
          'Stage advance PATCH landed below the target; leaving pending',
          {
            chapterAssignmentId: row.chapterAssignmentId,
            fromStatus,
            toStatus,
            patchedStatus,
          },
        );
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
    } catch (error) {
      // Multi-account drains absorb one owner's 401 so the other accounts
      // still drain; that owner's rows (and later rows on the same chapter)
      // stay pending until it signs in again (#854).
      if (!isAuthError(error) || !options.onOwnerAuthFailure) throw error;
      options.onOwnerAuthFailure(row.userId);
      signInRequiredOwners.add(row.userId);
      blockedAssignmentIds.add(row.chapterAssignmentId);
    }
  }

  return { synced, dropped, failed, blocked };
}
