import {
  getDatabaseWriteMark,
  getPendingUploadChapters,
  hasPendingChapterClaimsForUser,
  sameDatabaseWrites,
  type DatabaseWriteMark,
} from '../db/queries';
import {
  getRecordingOwnerIds,
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
import { AuthError } from './authError';
import { getCredentials } from './keychain';
import {
  getActiveUserId,
  getSyncPausedUntilMs,
  setSyncPausedUntilMs,
  setReauthRequired,
} from './storage';
import {
  syncPendingChapterClaimsForUser,
  syncPendingStageAdvancesForUser,
} from './sync';
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
  type UploadOrchestrator,
  type UploadOrchestratorDeps,
  type UploadOrchestratorSnapshot,
} from './uploadOrchestratorCore';

const log = logger.create('UploadOrchestrator');

async function capturedQueueOwnerToken(
  userId: number,
  hasPending: () => Promise<boolean>,
): Promise<string | null> {
  let token: string | undefined;
  try {
    token = (await getCredentials(String(userId)))?.token;
  } catch {
    log.warn('Could not read queued owner credentials', { userId });
  }
  if (token) return token;
  // An empty queue needs no authenticated request. Never drain a nonempty
  // owner's queue with the mutable global bearer after an account switch.
  if (!(await hasPending().catch(() => true))) return null;
  const ownerId = String(userId);
  setReauthRequired(ownerId);
  if (getActiveUserId() === ownerId) emitAuthReauthRequired(ownerId);
  throw new AuthError(
    'Queued owner credentials are missing',
    'OWNER_CREDENTIALS_MISSING',
  );
}

async function pushPendingClaimsBeforeUpload(): Promise<void> {
  const activeUserId = getActiveUserId();
  const userId = Number(activeUserId);
  if (!Number.isFinite(userId) || userId <= 0) {
    log.warn('Skipping claim push before upload — no active user', {
      activeUserId,
    });
    return;
  }
  // Pass the active account's own token so the claim is attributed to the
  // queued user even if the global auth token changes mid-session (#886).
  const token = await capturedQueueOwnerToken(userId, () =>
    hasPendingChapterClaimsForUser(userId),
  );
  if (!token) return;
  const result = await syncPendingChapterClaimsForUser(userId, token);
  // Offline at claim time is deferred work: the orchestrator takes its
  // connectivity-pause path (resume on reconnect) rather than uploading past
  // a claim that has not landed (#886).
  if ((result.deferred ?? 0) > 0) {
    throw new UploadNetworkInterruptedError(
      `Chapter claim push deferred ${result.deferred} claim(s): offline`,
    );
  }
  // Rows left failed resolve rather than throw. Throw so a drain-only session
  // skips `complete` and schedules its bounded retry; a take session logs and
  // uploads anyway, as before (#886).
  if (result.failed > 0) {
    throw new Error(
      `Chapter claim push left ${result.failed} claim(s) pending`,
    );
  }
}

async function pushPendingStageAdvancesAfterUpload(): Promise<void> {
  const activeUserId = getActiveUserId();
  const userId = Number(activeUserId);
  if (!Number.isFinite(userId) || userId <= 0) {
    log.warn('Skipping stage-advance push after upload — no active user', {
      activeUserId,
    });
    return;
  }
  const token = await capturedQueueOwnerToken(userId, async () =>
    (await getPendingStageAdvances()).some(row => row.userId === userId),
  );
  if (!token) return;
  const result = await syncPendingStageAdvancesForUser(userId, token);
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

async function hasPendingStageAdvances(): Promise<boolean> {
  const activeUserId = getActiveUserId();
  const userId = Number(activeUserId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return false;
  }
  try {
    const pending = await getPendingStageAdvances();
    return pending.some(row => row.userId === userId);
  } catch (error) {
    log.warn(
      'Could not check pending stage advances; attempting drain on reconnect',
      { error },
    );
    return true;
  }
}

async function hasPendingClaims(): Promise<boolean> {
  const activeUserId = getActiveUserId();
  const userId = Number(activeUserId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return false;
  }
  try {
    return await hasPendingChapterClaimsForUser(userId);
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
    getPendingUploadChapters,
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
