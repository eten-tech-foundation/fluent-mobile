import type { PendingUploadChapter } from '../db/queries';
import { logger } from '../utils/logger';
import type { UploadSessionEvent } from './syncEvents';

const log = logger.create('UploadOrchestrator');

export const PAUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type UploadPhase =
  | 'idle'
  | 'syncing'
  | 'paused'
  | 'waiting_wifi'
  | 'offline';

export type ChapterUploadWorker = {
  uploadChapter: (
    chapter: PendingUploadChapter,
    signal: AbortSignal,
  ) => Promise<void>;
};

export type UploadOrchestratorDeps = {
  subscribeToConnectivity: (
    onChange: (isOnline: boolean, isWifi: boolean) => void,
  ) => () => void;
  getUploadOverCellular: () => boolean;
  subscribeToUploadOverCellular: (
    listener: (value: boolean) => void,
  ) => () => void;
  getPendingUploadChapters: () => Promise<PendingUploadChapter[]>;
  getPausedUntilMs: () => number | null;
  setPausedUntilMs: (ms: number | null) => void;
  now: () => number;
  pauseWindowMs: number;
  worker: ChapterUploadWorker | null;
  emit: (event: UploadSessionEvent) => void;
};

export type UploadOrchestratorSnapshot = {
  phase: UploadPhase;
  completedChapters: number;
  totalChapters: number;
  pausedUntilMs: number | null;
};

export type UploadOrchestrator = {
  start: () => void;
  stop: () => void;
  pause: () => Promise<void>;
  cancel: () => Promise<void>;
  syncNow: () => Promise<void>;
  getSnapshot: () => UploadOrchestratorSnapshot;
};

function transportAllowsUpload(
  isOnline: boolean,
  isWifi: boolean,
  uploadOverCellular: boolean,
): 'ok' | 'offline' | 'waiting_wifi' {
  if (!isOnline) {
    return 'offline';
  }
  if (!isWifi && !uploadOverCellular) {
    return 'waiting_wifi';
  }
  return 'ok';
}

/** Pure upload session orchestrator (injectable deps for unit tests). */
export function createUploadOrchestrator(
  deps: UploadOrchestratorDeps,
): UploadOrchestrator {
  let phase: UploadPhase = 'idle';
  let completedChapters = 0;
  let totalChapters = 0;
  let isOnline = false;
  let isWifi = false;
  let started = false;
  let unsubConnectivity: (() => void) | null = null;
  let unsubPrefs: (() => void) | null = null;
  let sessionAbort: AbortController | null = null;
  let sessionPromise: Promise<void> | null = null;
  /** After cancel, suppress auto-start until the next reachability→online edge. */
  let suppressAutoUntilOnlineEdge = false;
  let wasOnline = false;
  let evaluateChain: Promise<void> = Promise.resolve();

  const snapshot = (): UploadOrchestratorSnapshot => ({
    phase,
    completedChapters,
    totalChapters,
    pausedUntilMs: deps.getPausedUntilMs(),
  });

  const isUserPaused = (): boolean => {
    const until = deps.getPausedUntilMs();
    return until !== null && deps.now() < until;
  };

  const abortActiveSession = async (): Promise<void> => {
    if (sessionAbort) {
      sessionAbort.abort();
    }
    if (sessionPromise) {
      try {
        await sessionPromise;
      } catch {
        // aborted / failed sessions are expected
      }
    }
    sessionAbort = null;
    sessionPromise = null;
  };

  const runSession = async (reason: 'auto' | 'sync_now'): Promise<void> => {
    if (sessionPromise) {
      return;
    }
    if (!deps.worker) {
      log.info('No chapter upload worker registered; skipping session', {
        reason,
      });
      phase = isUserPaused() ? 'paused' : 'idle';
      deps.emit({ type: 'idle' });
      return;
    }

    const gate = transportAllowsUpload(
      isOnline,
      isWifi,
      deps.getUploadOverCellular(),
    );
    if (gate === 'offline') {
      phase = 'offline';
      return;
    }
    if (gate === 'waiting_wifi') {
      phase = 'waiting_wifi';
      deps.emit({ type: 'waiting_wifi' });
      return;
    }
    if (reason === 'auto' && isUserPaused()) {
      phase = 'paused';
      deps.emit({ type: 'paused', reason: 'user' });
      return;
    }
    if (reason === 'auto' && suppressAutoUntilOnlineEdge) {
      return;
    }

    const chapters = await deps.getPendingUploadChapters();
    if (chapters.length === 0) {
      phase = 'idle';
      deps.emit({ type: 'idle' });
      return;
    }

    const abort = new AbortController();
    sessionAbort = abort;
    completedChapters = 0;
    totalChapters = chapters.length;
    phase = 'syncing';
    deps.emit({ type: 'start', totalChapters: chapters.length });
    log.info('Upload session started', {
      reason,
      totalChapters: chapters.length,
    });

    const work = (async () => {
      try {
        for (const chapter of chapters) {
          if (abort.signal.aborted) {
            return;
          }
          await deps.worker!.uploadChapter(chapter, abort.signal);
          if (abort.signal.aborted) {
            return;
          }
          completedChapters += 1;
          deps.emit({
            type: 'progress',
            completedChapters,
            totalChapters,
          });
        }
        if (!abort.signal.aborted) {
          phase = 'idle';
          deps.emit({ type: 'complete' });
          log.info('Upload session complete', { totalChapters });
        }
      } catch (error) {
        if (abort.signal.aborted) {
          return;
        }
        log.error('Upload session failed', { error });
        phase = 'idle';
        deps.emit({ type: 'idle' });
      }
    })();

    sessionPromise = work.finally(() => {
      if (sessionAbort === abort) {
        sessionAbort = null;
        sessionPromise = null;
      }
    });

    await sessionPromise;
  };

  const evaluateAuto = (): void => {
    evaluateChain = evaluateChain
      .then(async () => {
        const gate = transportAllowsUpload(
          isOnline,
          isWifi,
          deps.getUploadOverCellular(),
        );

        if (gate === 'offline') {
          // Offline transitions are handled immediately in onConnectivity.
          if (phase !== 'paused') {
            phase = 'offline';
          }
          return;
        }

        if (sessionPromise && phase === 'syncing') {
          return;
        }

        if (isUserPaused()) {
          phase = 'paused';
          return;
        }

        if (gate === 'waiting_wifi') {
          phase = 'waiting_wifi';
          deps.emit({ type: 'waiting_wifi' });
          return;
        }

        // Do not await — keeps the evaluate chain free for later triggers.
        void runSession('auto');
      })
      .catch(error => {
        log.error('Upload orchestrator evaluate failed', { error });
      });
  };

  const onConnectivity = (online: boolean, wifi: boolean) => {
    const becameOnline = online && !wasOnline;
    wasOnline = online;
    isOnline = online;
    isWifi = wifi;

    if (!online) {
      // Interrupt mid-upload immediately — do not wait on the evaluate chain.
      void (async () => {
        if (sessionPromise) {
          await abortActiveSession();
          phase = 'offline';
          deps.emit({ type: 'paused', reason: 'connectivity' });
          log.info('Upload paused silently (server unreachable)');
        } else if (phase !== 'paused') {
          phase = 'offline';
        }
      })();
      return;
    }

    if (becameOnline) {
      suppressAutoUntilOnlineEdge = false;
    }

    evaluateAuto();
  };

  return {
    start() {
      if (started) {
        return;
      }
      started = true;
      unsubConnectivity = deps.subscribeToConnectivity(onConnectivity);
      unsubPrefs = deps.subscribeToUploadOverCellular(() => {
        evaluateAuto();
      });
      log.info('Upload orchestrator started');
    },

    stop() {
      if (!started) {
        return;
      }
      started = false;
      unsubConnectivity?.();
      unsubPrefs?.();
      unsubConnectivity = null;
      unsubPrefs = null;
      void abortActiveSession();
      phase = 'idle';
      log.info('Upload orchestrator stopped');
    },

    async pause() {
      const until = deps.now() + deps.pauseWindowMs;
      deps.setPausedUntilMs(until);
      await abortActiveSession();
      phase = 'paused';
      deps.emit({ type: 'paused', reason: 'user' });
      log.info('Upload paused by user', {
        until: new Date(until).toISOString(),
      });
    },

    async cancel() {
      deps.setPausedUntilMs(null);
      suppressAutoUntilOnlineEdge = true;
      await abortActiveSession();
      phase = 'idle';
      deps.emit({ type: 'cancelled' });
      log.info('Upload cancelled by user');
    },

    async syncNow() {
      deps.setPausedUntilMs(null);
      suppressAutoUntilOnlineEdge = false;
      await abortActiveSession();
      await runSession('sync_now');
    },

    getSnapshot: snapshot,
  };
}
