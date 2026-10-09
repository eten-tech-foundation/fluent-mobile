import { getPendingUploadChapters } from '../db/queries';
import {
  getConnectivitySnapshot,
  subscribeToConnectivity,
} from './connectivity';
import { emitUploadSessionEvent } from './syncEvents';
import {
  getActiveUserId,
  getSyncPausedUntilMs,
  setSyncPausedUntilMs,
} from './storage';
import { syncPendingChapterClaimsForUser } from './sync';
import {
  getUploadOverCellular,
  subscribeToPreference,
} from './userPreferences';
import { logger } from '../utils/logger';
import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  type ChapterUploadWorker,
  type UploadOrchestrator,
  type UploadOrchestratorDeps,
  type UploadOrchestratorSnapshot,
} from './uploadOrchestratorCore';

const log = logger.create('UploadOrchestrator');

async function pushPendingClaimsBeforeUpload(): Promise<void> {
  const activeUserId = getActiveUserId();
  const userId = Number(activeUserId);
  if (!Number.isFinite(userId) || userId <= 0) {
    log.warn('Skipping claim push before upload — no active user', {
      activeUserId,
    });
    return;
  }
  await syncPendingChapterClaimsForUser(userId);
}

export {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  SESSION_RETRY_MAX_ATTEMPTS,
  sessionRetryDelayMs,
  type ChapterUploadWorker,
  type UploadOrchestrator,
  type UploadOrchestratorDeps,
  type UploadOrchestratorSnapshot,
  type UploadPhase,
} from './uploadOrchestratorCore';

/** Production singleton — worker registered by #100 via setChapterUploadWorker. */
let chapterUploadWorker: ChapterUploadWorker | null = null;
let singleton: UploadOrchestrator | null = null;

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
    getSessionTransportSnapshot: async () => {
      const snapshot = await getConnectivitySnapshot();
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
    ...restOverrides,
  };

  singleton = createUploadOrchestrator(deps);
  singleton.start();
  return singleton;
}

export function stopUploadOrchestrator(): void {
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
