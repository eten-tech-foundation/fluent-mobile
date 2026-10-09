import type { PendingUploadChapter } from '../db/queries';
import { logger } from '../utils/logger';
import { isUploadNetworkInterruptedError } from '../utils/networkError';
import { transportAllowsTransfer } from '../utils/transportPolicy';
import type { UploadSessionEvent } from './syncEvents';

const log = logger.create('UploadOrchestrator');

export const PAUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Failed-session retries use #150's existing silent-retry default: three
 * attempts, delay `attempt * 500` ms (same as recording upload and metadata
 * sync). Longer escalation stays out of scope.
 */
export const SESSION_RETRY_MAX_ATTEMPTS = 3;

export function sessionRetryDelayMs(attempt: number): number {
  return attempt * 500;
}

function defaultSchedule(callback: () => void, delayMs: number): () => void {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
}

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
    onChange: (
      isOnline: boolean,
      isWifi: boolean,
      isCellular?: boolean,
      connectionType?: string,
    ) => void,
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
  /** Fresh reachability for Sync Now / runSession (avoids stale cache vs Sync UI). */
  getSessionTransportSnapshot?: () => Promise<{
    isOnline: boolean;
    isWifi: boolean;
    connectionType: string;
  }>;
  /**
   * Pause-window expiry and failed-session retry.
   * Defaults to setTimeout; tests inject a manual scheduler.
   */
  schedule?: (callback: () => void, delayMs: number) => () => void;
  /**
   * Push offline chapter claims before uploading takes (#611).
   * Soft-fail / auth behavior is owned by the injected implementation.
   */
  pushPendingClaimsBeforeUpload?: () => Promise<void>;
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
  /** A take was saved (or other pending work appeared) while the app is open. */
  notifyPendingWork: () => void;
  getSnapshot: () => UploadOrchestratorSnapshot;
};

/** Pure upload session orchestrator (injectable deps for unit tests). */
export function createUploadOrchestrator(
  deps: UploadOrchestratorDeps,
): UploadOrchestrator {
  let phase: UploadPhase = 'idle';
  let completedChapters = 0;
  let totalChapters = 0;
  let isOnline = false;
  let isWifi = false;
  let connectionType = '';
  let started = false;
  let unsubConnectivity: (() => void) | null = null;
  let unsubPrefs: (() => void) | null = null;
  let sessionAbort: AbortController | null = null;
  let sessionPromise: Promise<void> | null = null;
  /** After cancel, suppress auto-start until the next reachability→online edge. */
  let suppressAutoUntilOnlineEdge = false;
  let wasOnline = false;
  let evaluateChain: Promise<void> = Promise.resolve();
  const schedule = deps.schedule ?? defaultSchedule;
  let pauseTimerCancel: (() => void) | null = null;
  let retryTimerCancel: (() => void) | null = null;
  let sessionFailures = 0;
  /** True from the moment a session begins until it fully unwinds. */
  let sessionOpen = false;
  /** Take saved (or similar) while a session was in flight. */
  let rerunAfterSession = false;

  const clearPauseTimer = (): void => {
    pauseTimerCancel?.();
    pauseTimerCancel = null;
  };

  const clearRetryTimer = (): void => {
    retryTimerCancel?.();
    retryTimerCancel = null;
  };

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

  const applyFreshTransportSnapshot = async (): Promise<void> => {
    if (!deps.getSessionTransportSnapshot) {
      return;
    }

    const snapshot = await deps.getSessionTransportSnapshot();
    isOnline = snapshot.isOnline;
    isWifi = snapshot.isWifi;
    connectionType = snapshot.connectionType;

    if (snapshot.isOnline) {
      wasOnline = true;
    }
  };

  function armPauseTimer(): void {
    clearPauseTimer();
    const until = deps.getPausedUntilMs();
    if (until === null) {
      return;
    }
    const delay = until - deps.now();
    if (delay <= 0) {
      return;
    }
    pauseTimerCancel = schedule(() => {
      pauseTimerCancel = null;
      evaluateAuto();
    }, delay);
  }

  function scheduleSessionRetry(): boolean {
    clearRetryTimer();
    if (sessionFailures >= SESSION_RETRY_MAX_ATTEMPTS) {
      log.info('Upload session retry budget exhausted', {
        attempts: sessionFailures,
      });
      return false;
    }
    const delayMs = sessionRetryDelayMs(sessionFailures);
    log.info('Scheduling upload session retry', {
      attempt: sessionFailures,
      delayMs,
    });
    retryTimerCancel = schedule(() => {
      retryTimerCancel = null;
      evaluateAuto();
    }, delayMs);
    return true;
  }

  const runSession = async (reason: 'auto' | 'sync_now'): Promise<void> => {
    if (sessionPromise || sessionOpen) {
      rerunAfterSession = true;
      return;
    }
    sessionOpen = true;
    // Object so the async work closure can publish the outcome. A bare `let`
    // is narrowed to its initializer at `finally`, which hides the assignment.
    const sessionResult: { followUp: 'none' | 'retry' } = { followUp: 'none' };

    try {
      if (!deps.worker) {
        log.info('No chapter upload worker registered; skipping session', {
          reason,
        });
        phase = isUserPaused() ? 'paused' : 'idle';
        deps.emit({ type: 'idle' });
        return;
      }

      await applyFreshTransportSnapshot();

      const uploadOverCellular = deps.getUploadOverCellular();
      const gate = transportAllowsTransfer({
        isOnline,
        isWifi,
        connectionType,
        uploadOverCellular,
      });
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
        armPauseTimer();
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
      // Lock the session before awaiting claims so Cancel/parallel Sync Now
      // cannot start a second runSession during the claim round-trip (#611).
      phase = 'syncing';
      deps.emit({ type: 'start', totalChapters: chapters.length });
      log.info('Upload session started', {
        reason,
        totalChapters: chapters.length,
      });

      const work = (async () => {
        try {
          // Claims must land before takes — reconnect auto-upload and Sync Now
          // otherwise race the full sync's claim step (~30s of master data) (#611).
          // Race abort so Cancel/pause do not hang on the claim round-trip.
          if (deps.pushPendingClaimsBeforeUpload) {
            try {
              await Promise.race([
                deps.pushPendingClaimsBeforeUpload(),
                new Promise<never>((_, reject) => {
                  if (abort.signal.aborted) {
                    reject(new Error('aborted'));
                    return;
                  }
                  abort.signal.addEventListener(
                    'abort',
                    () => {
                      reject(new Error('aborted'));
                    },
                    { once: true },
                  );
                }),
              ]);
            } catch (error) {
              if (abort.signal.aborted) {
                return;
              }
              log.warn('Pending claim push before upload failed; continuing', {
                reason,
                error,
              });
            }
          }
          if (abort.signal.aborted) {
            return;
          }
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
            sessionFailures = 0;
            clearRetryTimer();
          }
        } catch (error) {
          if (abort.signal.aborted) {
            return;
          }
          if (isUploadNetworkInterruptedError(error)) {
            log.info('Upload session paused after network drop', { error });
            phase = 'idle';
            deps.emit({ type: 'idle' });
            return;
          }
          log.error('Upload session failed', { error });
          phase = 'idle';
          deps.emit({ type: 'idle' });
          sessionFailures += 1;
          sessionResult.followUp = 'retry';
        }
      })();

      sessionPromise = work.finally(() => {
        if (sessionAbort === abort) {
          sessionAbort = null;
          sessionPromise = null;
        }
      });

      await sessionPromise;
    } finally {
      sessionOpen = false;
      const shouldRerun = rerunAfterSession;
      rerunAfterSession = false;
      const retryArmed =
        sessionResult.followUp === 'retry' ? scheduleSessionRetry() : false;
      // A retry timer already covers work saved during the session. If the
      // budget is spent, that timer is not armed — still start the save.
      if (shouldRerun && !retryArmed) {
        evaluateAuto();
      }
    }
  };

  const evaluateAuto = (): void => {
    evaluateChain = evaluateChain
      .then(async () => {
        const gate = transportAllowsTransfer({
          isOnline,
          isWifi,
          connectionType,
          uploadOverCellular: deps.getUploadOverCellular(),
        });

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
          clearRetryTimer();
          armPauseTimer();
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

  const onConnectivity = (
    online: boolean,
    wifi: boolean,
    _isCellular?: boolean,
    type?: string,
  ) => {
    const becameOnline = online && !wasOnline;
    wasOnline = online;
    isOnline = online;
    isWifi = wifi;
    connectionType = type ?? (wifi ? 'wifi' : '');

    if (!online) {
      clearRetryTimer();
      sessionFailures = 0;
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
      armPauseTimer();
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
      clearPauseTimer();
      clearRetryTimer();
      sessionFailures = 0;
      rerunAfterSession = false;
      void abortActiveSession();
      phase = 'idle';
      log.info('Upload orchestrator stopped');
    },

    async pause() {
      const until = deps.now() + deps.pauseWindowMs;
      deps.setPausedUntilMs(until);
      clearRetryTimer();
      sessionFailures = 0;
      rerunAfterSession = false;
      await abortActiveSession();
      phase = 'paused';
      deps.emit({ type: 'paused', reason: 'user' });
      armPauseTimer();
      log.info('Upload paused by user', {
        until: new Date(until).toISOString(),
      });
    },

    async cancel() {
      deps.setPausedUntilMs(null);
      suppressAutoUntilOnlineEdge = true;
      clearPauseTimer();
      clearRetryTimer();
      sessionFailures = 0;
      rerunAfterSession = false;
      await abortActiveSession();
      phase = 'idle';
      deps.emit({ type: 'cancelled' });
      log.info('Upload cancelled by user');
    },

    async syncNow() {
      deps.setPausedUntilMs(null);
      suppressAutoUntilOnlineEdge = false;
      clearPauseTimer();
      clearRetryTimer();
      sessionFailures = 0;
      rerunAfterSession = false;
      await abortActiveSession();
      await runSession('sync_now');
    },

    notifyPendingWork() {
      if (!started) {
        return;
      }
      if (sessionPromise || sessionOpen) {
        rerunAfterSession = true;
        return;
      }
      evaluateAuto();
    },

    getSnapshot: snapshot,
  };
}
