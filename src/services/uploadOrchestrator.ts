import {
  getDatabaseWriteMark,
  getDevicePendingUploadChapters,
  getPendingChapterClaims,
  sameDatabaseWrites,
  type DatabaseWriteMark,
} from '../db/queries';
import {
  getRecordingOwnerIds,
  hasRecordingsAffectedByMembership,
  reconcileHeldRecordings,
} from '../db/repositories/heldRecordingsRepository';
import {
  getVerifiedMembershipOwners,
  refreshMembershipForOwners,
} from './projectMembership';
import { getPendingStageAdvances } from '../db/stageAdvanceQueueRepository';
import {
  getConnectivitySnapshot,
  getRecentOnlineReachability,
  subscribeToConnectivity,
} from './connectivity';
import {
  emitAuthReauthRequired,
  emitHeldRecordingsChanged,
  emitUploadSessionEvent,
  onSyncComplete,
} from './syncEvents';
import { AuthError, isAuthError } from './authError';
import { getCredentials } from './keychain';
import {
  getActiveUserId,
  getSyncPausedUntilMs,
  isReauthRequired,
  setSyncPausedUntilMs,
  setReauthRequired,
} from './storage';
import {
  syncPendingChapterClaimsForUser,
  syncPendingStageAdvancesForAccounts,
} from './sync';
import { syncPendingChapterClaims } from './chapterClaimSync';
import {
  getUploadOverCellular,
  subscribeToPreference,
} from './userPreferences';
import { logger } from '../utils/logger';
import { UploadNetworkInterruptedError } from '../utils/networkError';
import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  type ChapterUploadWorker,
  type StagePushOutcome,
  type UploadOrchestrator,
  type UploadOrchestratorDeps,
  type UploadOrchestratorSnapshot,
} from './uploadOrchestratorCore';

const log = logger.create('UploadOrchestrator');

/**
 * Stored session token for a queued row's account, or null when that account
 * has none (signed out on this device, or never stored) or another account's
 * stored token was already rejected. Never falls back to
 * the active account's token: queued work uploads only as the account that
 * made it (#854).
 */
async function storedOwnerToken(userId: number): Promise<string | null> {
  const ownerId = String(userId);
  // Another account whose stored token was already rejected: do not send it
  // again; its work waits for it to sign in (#854).
  if (ownerId !== getActiveUserId() && isReauthRequired(ownerId)) {
    return null;
  }
  try {
    return (await getCredentials(String(userId)))?.token ?? null;
  } catch {
    log.warn('Could not read queued owner credentials', { userId });
    return null;
  }
}

/**
 * An account with queued work but no usable session: keep its work pending
 * and flag it so the Sync page asks it to sign in (#854). The active account
 * keeps the old behavior (fail the session into the reauth path), since its
 * own session is what the user is looking at.
 */
function ownerNeedsSignIn(userId: number): void {
  const ownerId = String(userId);
  setReauthRequired(ownerId);
  if (getActiveUserId() === ownerId) {
    emitAuthReauthRequired(ownerId);
    throw new AuthError(
      'Queued owner credentials are missing',
      'OWNER_CREDENTIALS_MISSING',
    );
  }
  log.info('Account with queued work must sign in again; leaving it pending', {
    userId,
  });
}

function distinctOwners(rows: ReadonlyArray<{ userId: number }>): number[] {
  return [
    ...new Set(
      rows.map(row => row.userId).filter(id => Number.isFinite(id) && id > 0),
    ),
  ];
}

/**
 * Push every account's queued offline claims before any take, each with that
 * account's own token: the claim endpoint assigns to the bearer (#886, #854).
 */
async function pushPendingClaimsBeforeUpload(): Promise<void> {
  let owners: number[];
  try {
    owners = distinctOwners(await getPendingChapterClaims());
  } catch (error) {
    // Unreadable queue: still push the active account's claims, as before
    // (#886). Other accounts' claims wait for a readable queue.
    log.warn('Could not read queued claims; pushing the active account only', {
      error,
    });
    const activeUserId = Number(getActiveUserId());
    owners =
      Number.isFinite(activeUserId) && activeUserId > 0 ? [activeUserId] : [];
  }
  let deferred = 0;
  let failed = 0;
  for (const userId of owners) {
    const token = await storedOwnerToken(userId);
    if (!token) {
      ownerNeedsSignIn(userId);
      continue;
    }
    if (getActiveUserId() === String(userId)) {
      const result = await syncPendingChapterClaimsForUser(userId, token);
      deferred += result.deferred ?? 0;
      failed += result.failed;
      continue;
    }
    // Another account: drain its rows directly, so its outcome never lands in
    // the active account's claim sync-error state (#854). An expired session
    // keeps its claims queued and flags it for sign-in; this account's upload
    // goes on.
    try {
      failed += (await syncPendingChapterClaims(userId, token)).failed;
    } catch (error) {
      if (!isAuthError(error)) throw error;
      setReauthRequired(String(userId));
      log.info('Account with queued claims must sign in again', { userId });
    }
  }
  // Offline at claim time is deferred work: the orchestrator takes its
  // connectivity-pause path (resume on reconnect) rather than uploading past
  // a claim that has not landed (#886).
  if (deferred > 0) {
    throw new UploadNetworkInterruptedError(
      `Chapter claim push deferred ${deferred} claim(s): offline`,
    );
  }
  // Rows left failed resolve rather than throw. Throw so a drain-only session
  // skips `complete` and schedules its bounded retry; a take session logs and
  // uploads anyway, as before (#886).
  if (failed > 0) {
    throw new Error(`Chapter claim push left ${failed} claim(s) pending`);
  }
}

/**
 * Push every account's queued stage advances in queue order, each with its own
 * token (#854). An account without a session keeps its rows pending (the Sync
 * page asks it to sign in); rows from other accounts on the same chapter wait
 * behind them and are reported as `blocked`. A signed-out account's own rows
 * do not keep the active account's session from completing.
 */
async function pushPendingStageAdvancesAfterUpload(): Promise<StagePushOutcome> {
  const owners = distinctOwners(await getPendingStageAdvances());
  const tokens = new Map<number, string>();
  for (const userId of owners) {
    const token = await storedOwnerToken(userId);
    if (token) {
      tokens.set(userId, token);
    } else {
      ownerNeedsSignIn(userId);
    }
  }
  if (tokens.size === 0) {
    return { progressed: false, blocked: 0 };
  }
  const result = await syncPendingStageAdvancesForAccounts(tokens);
  // Rows left pending resolve as `failed` rather than throwing. Throw so the
  // session skips `complete` and schedules its bounded retry (#257).
  if (result.failed > 0) {
    throw new Error(`Stage-advance drain left ${result.failed} row(s) pending`);
  }
  // Offline at drain time is deferred work, not a failure: take the
  // connectivity-pause path (resume on reconnect, retry budget untouched)
  // instead of emitting `complete` over queued rows (#886).
  if (result.deferred > 0) {
    throw new UploadNetworkInterruptedError(
      `Stage-advance drain deferred ${result.deferred} row(s): offline`,
    );
  }
  return {
    progressed: result.synced + result.dropped > 0,
    blocked: result.blocked,
  };
}

/**
 * Fresh server truth for every account that owns work on the device (#848).
 * An owner that cannot be confirmed keeps its takes deferred (the passes and
 * the reconcile below only act on verified owners) without blocking the rest;
 * the session defers and retries only when no owner could be confirmed.
 * Signed-out sessions keep the existing cache-only behavior.
 */
async function refreshMembershipBeforeUpload(): Promise<void> {
  const activeUserId = Number(getActiveUserId());
  if (!Number.isFinite(activeUserId) || activeUserId <= 0) {
    return;
  }
  const owners = await getRecordingOwnerIds(activeUserId);
  const verified = await refreshMembershipForOwners(owners);
  if (verified.size === 0) {
    throw new Error(
      'Project membership could not be confirmed for any account',
    );
  }
}

async function reconcileHeldBeforeUpload(): Promise<{
  held: number;
  released: number;
}> {
  const activeUserId = Number(getActiveUserId());
  const outcome = await reconcileHeldRecordings(
    Number.isFinite(activeUserId) && activeUserId > 0 ? activeUserId : null,
    [...getVerifiedMembershipOwners()],
  );
  if (outcome.held > 0 || outcome.released > 0) {
    emitHeldRecordingsChanged();
  }
  return { held: outcome.held, released: outcome.released };
}

/** Any account's queued stage advance starts a session (#257, #854). */
async function hasPendingStageAdvances(): Promise<boolean> {
  try {
    return (await getPendingStageAdvances()).length > 0;
  } catch (error) {
    log.warn(
      'Could not check pending stage advances; attempting drain on reconnect',
      { error },
    );
    return true;
  }
}

/** Any account's queued claim starts a session (#886, #854). */
async function hasPendingClaims(): Promise<boolean> {
  try {
    return (await getPendingChapterClaims()).length > 0;
  } catch (error) {
    log.warn(
      'Could not check pending chapter claims; attempting push on reconnect',
      {
        error,
      },
    );
    return true;
  }
}

type QueueWriteMark = { userId: string | null; writes: DatabaseWriteMark };

async function getQueueWriteMark(): Promise<QueueWriteMark | null> {
  const userId = getActiveUserId();
  const writes = await getDatabaseWriteMark();
  return writes ? { userId, writes } : null;
}

function sameQueueWriteMark(a: object, b: object): boolean {
  const first = a as QueueWriteMark;
  const second = b as QueueWriteMark;
  return (
    first.userId === second.userId &&
    sameDatabaseWrites(first.writes, second.writes)
  );
}

export {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  SESSION_RETRY_MAX_ATTEMPTS,
  sessionRetryDelayMs,
  type ChapterUploadWorker,
  type TakeProgressListener,
  type UploadOrchestrator,
  type UploadOrchestratorDeps,
  type UploadOrchestratorSnapshot,
  type UploadPhase,
} from './uploadOrchestratorCore';

/** Production singleton — worker registered by #100 via setChapterUploadWorker. */
let chapterUploadWorker: ChapterUploadWorker | null = null;
let singleton: UploadOrchestrator | null = null;
/** #855: a metadata sync can restore project membership for held takes. Once
 * it completes, evaluate pending work so those takes upload with no extra
 * user action (the sync itself counts as "the next sync"). */
let unsubSyncComplete: (() => void) | null = null;
/** Survives stop/start (account switch) while Drafting stays focused. */
let desiredDraftingHold = false;

export function setChapterUploadWorker(
  worker: ChapterUploadWorker | null,
): void {
  chapterUploadWorker = worker;
}

export function getChapterUploadWorker(): ChapterUploadWorker | null {
  return chapterUploadWorker;
}

export function getUploadOrchestrator(): UploadOrchestrator {
  if (!singleton) {
    throw new Error(
      'Upload orchestrator not started — call startUploadOrchestrator first',
    );
  }
  return singleton;
}

export function startUploadOrchestrator(
  overrides?: Partial<UploadOrchestratorDeps>,
): UploadOrchestrator {
  if (singleton) {
    singleton.stop();
  }

  const { worker: workerOverride, ...restOverrides } = overrides ?? {};

  const deps: UploadOrchestratorDeps = {
    subscribeToConnectivity,
    getUploadOverCellular,
    subscribeToUploadOverCellular: listener =>
      subscribeToPreference('uploadOverCellular', listener),
    // Every account's chapters, not only the active one's (#854).
    getPendingUploadChapters: getDevicePendingUploadChapters,
    getPausedUntilMs: getSyncPausedUntilMs,
    setPausedUntilMs: setSyncPausedUntilMs,
    now: () => Date.now(),
    pauseWindowMs: PAUSE_WINDOW_MS,
    emit: emitUploadSessionEvent,
    getSessionTransportSnapshot: async options => {
      const snapshot =
        (options?.allowRecent ? getRecentOnlineReachability() : null) ??
        (await getConnectivitySnapshot());
      return {
        isOnline: snapshot.isOnline,
        isWifi: snapshot.isWifi,
        connectionType: snapshot.connectionType,
      };
    },
    worker:
      overrides && 'worker' in overrides
        ? workerOverride ?? null
        : chapterUploadWorker,
    pushPendingClaimsBeforeUpload,
    pushPendingStageAdvancesAfterUpload,
    hasPendingStageAdvances,
    refreshMembershipBeforeUpload,
    reconcileHeldBeforeUpload,
    hasRecordingsAffectedByMembership,
    hasPendingClaims,
    getQueueWriteMark,
    sameQueueWriteMark,
    ...restOverrides,
  };

  singleton = createUploadOrchestrator(deps, {
    initialDraftingHold: desiredDraftingHold,
  });
  singleton.start();
  unsubSyncComplete?.();
  unsubSyncComplete = onSyncComplete(() => notifyPendingUploads());
  return singleton;
}

export function stopUploadOrchestrator(): void {
  unsubSyncComplete?.();
  unsubSyncComplete = null;
  singleton?.stop();
  singleton = null;
}

/** Imperative APIs for Sync page controls (#151). */
export async function pauseUploadSession(): Promise<void> {
  await getUploadOrchestrator().pause();
}

export async function cancelUploadSession(): Promise<void> {
  await getUploadOrchestrator().cancel();
}

export async function syncNowUploads(): Promise<void> {
  await getUploadOrchestrator().syncNow();
}

export function getUploadSessionSnapshot(): UploadOrchestratorSnapshot {
  return getUploadOrchestrator().getSnapshot();
}

/**
 * A take was saved while the app is open. Starts an upload when transport
 * allows it, or queues one behind the in-flight session. No-op before start.
 */
export function notifyPendingUploads(): void {
  if (!singleton) {
    return;
  }
  singleton.notifyPendingWork();
}

/**
 * Hold automatic uploads while the drafting screen is open and the app is
 * in the foreground. No-op before the orchestrator starts. syncNow still runs.
 */
export async function setDraftingUploadHold(held: boolean): Promise<void> {
  desiredDraftingHold = held;
  if (!singleton) {
    return;
  }
  await singleton.setDraftingHold(held);
}
