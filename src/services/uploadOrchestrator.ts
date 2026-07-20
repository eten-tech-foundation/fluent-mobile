import { getPendingUploadChapters } from '../db/queries';
import { subscribeToConnectivity } from './connectivity';
import { emitUploadSessionEvent } from './syncEvents';
import { getSyncPausedUntilMs, setSyncPausedUntilMs } from './storage';
import {
  getUploadOverCellular,
  subscribeToPreference,
} from './userPreferences';
import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  type ChapterUploadWorker,
  type UploadOrchestrator,
  type UploadOrchestratorDeps,
  type UploadOrchestratorSnapshot,
} from './uploadOrchestratorCore';

export {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
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
    worker:
      overrides && 'worker' in overrides
        ? workerOverride ?? null
        : chapterUploadWorker,
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
