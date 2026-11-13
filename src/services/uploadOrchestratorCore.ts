import type { PendingUploadChapter } from '../db/queries';
import { logger } from '../utils/logger';
import { isUploadNetworkInterruptedError } from '../utils/networkError';
import { transportAllowsTransfer } from '../utils/transportPolicy';
import type { UploadSessionEvent, UploadTakeProgress } from './syncEvents';
import { isAuthError } from './authError';

const log = logger.create('UploadOrchestrator');

export const PAUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Failed-session retries use #150's existing silent-retry default: three
 * attempts, delay `attempt * 500` ms (same as recording upload and metadata
 * sync). Longer escalation stays out of scope. */
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

/** Per-take progress inside one chapter pass (#886). */
export type TakeProgressListener = (progress: {
  completedTakes: number;
  failedTakes: number;
  totalTakes: number;
}) => void;

export type ChapterUploadWorker = {
  uploadChapter: (
    chapter: PendingUploadChapter,
    signal: AbortSignal,
    onTakeProgress?: TakeProgressListener,
  ) => Promise<void>;
  /** Drain queued server take deletes (all owners) **once per session**, after
   * the claim push and before the first chapter, instead of re-scanning the
   * whole queue before every chapter (#886). Resolves with the number of
   * rows **the active account is shown as pending** that are left after a
   * terminal failure — the session still uploads every chapter, then ends
   * without `complete` so the bounded retry re-drains. Other owners' stuck
   * rows are logged and stay queued without blocking this user's session.
   * Throws on abort, network interruption and auth failure like `uploadChapter`.
   */
  drainPendingDeletions?: (signal: AbortSignal) => Promise<{ failed: number }>;
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
  /** `onError` runs when the read failed and the empty list is not an answer. */
  getPendingUploadChapters: (
    onError?: () => void,
  ) => Promise<PendingUploadChapter[]>;
  getPausedUntilMs: () => number | null;
  setPausedUntilMs: (ms: number | null) => void;
  now: () => number;
  pauseWindowMs: number;
  worker: ChapterUploadWorker | null;
  emit: (event: UploadSessionEvent) => void;
  /**
   * Fresh reachability for Sync Now / runSession (avoids stale cache vs Sync UI).
   * `allowRecent` lets the session started by an online publish reuse that
   * just-completed `/health` success instead of probing again.
   */
  getSessionTransportSnapshot?: (options?: {
    allowRecent: boolean;
  }) => Promise<{
    isOnline: boolean;
    isWifi: boolean;
    connectionType: string;
  }>;
  /**
   * Push offline chapter claims before uploading takes (#611).
   * Soft-fail / auth behavior is owned by the injected implementation.
   */
  pushPendingClaimsBeforeUpload?: () => Promise<void>;
  /**
   * Push queued stage advances after takes finish (#257). Peer Check PATCH
   * before verse-audio upload 404s ("Verse audio recording not found").
   * A rejection (including a drain that left rows pending) fails the session:
   * no `complete`, and the bounded retry re-drains the stage-only remainder.
   */
  pushPendingStageAdvancesAfterUpload?: () => Promise<void>;
  /**
   * True when the active user has a pending stage-advance row. Reconnect with
   * no takes still drains those rows (#257 Sync on Reconnect).
   */
  hasPendingStageAdvances?: () => Promise<boolean>;
  /**
   * Replace cached project membership with the server's current answer before
   * any held-recording reconciliation (#848). Cache-only reconciliation cannot
   * see a removal that happened while the device was offline, so this must run
   * first. A rejection means membership is unconfirmed: the session defers and
   * retries instead of uploading against a stale cache.
   */
  refreshMembershipBeforeUpload?: () => Promise<void>;
  /**
   * Return held takes to the queue when project membership is back (#855).
   * Runs before the pending-chapter read: held rows are excluded from that
   * read, so releasing them afterwards would leave them stuck on the device.
   * Resolves with the number of held rows still left on a terminal failure —
   * the session must not proceed past the failure, so the bounded retry
   * re-evaluates without deleting those takes.
   */
  reconcileHeldBeforeUpload?: () => Promise<{ held: number; released: number }>;
  /**
   * True when the active user has a queued offline chapter claim. A reconnect
   * with no takes and no stage rows still runs a session so the claim is
   * pushed instead of waiting for the next metadata trigger (#886).
   */
  hasPendingClaims?: () => Promise<boolean>;
  /**
   * The active user and the database's write count, or null when unreadable
   * (#886). While it equals the mark taken before an automatic check that
   * cleanly found nothing queued, no row has been written since, so the
   * queue is still empty.
   */
  getQueueWriteMark?: () => Promise<object | null>;
  /**
   * Pause-window expiry and failed-session retry.
   * Defaults to setTimeout; tests inject a manual scheduler.
   */
  schedule?: (callback: () => void, delayMs: number) => () => void;
  sameQueueWriteMark?: (a: object, b: object) => boolean;
};

export type UploadOrchestratorSnapshot = {
  phase: UploadPhase;
  completedChapters: number;
  totalChapters: number;
  pausedUntilMs: number | null;
  /** Take progress for the chapter uploading right now, else null (#886). */
  currentChapter: UploadTakeProgress | null;
  /** Why automatic uploads are not starting, when they are held (#886). */
  holdReason: 'drafting' | null;
};

export type UploadOrchestrator = {
  start: () => void;
  stop: () => void;
  pause: () => Promise<void>;
  cancel: () => Promise<void>;
  syncNow: () => Promise<void>;
  /** A take was saved (or other pending work appeared) while the app is open. */
  notifyPendingWork: () => void;
  /**
   * While held, automatic uploads do not start. An in-flight session is left
   * running. Explicit syncNow still runs.
   */
  setDraftingHold: (held: boolean) => Promise<void>;
  getSnapshot: () => UploadOrchestratorSnapshot;
};

/** Pure upload session orchestrator (injectable deps for unit tests). */
export function createUploadOrchestrator(
  deps: UploadOrchestratorDeps,
  options?: { initialDraftingHold?: boolean },
): UploadOrchestrator {
  let phase: UploadPhase = 'idle';
  let completedChapters = 0;
  let totalChapters = 0;
  let currentChapter: UploadTakeProgress | null = null;
  /** Chapters that belong to the current pause/resume session (`bookId:chapterNumber`). */
  let sessionKeys = new Set<string>();
  let isOnline = false;
  let isWifi = false;
  let connectionType = '';
  let started = false;
  // Invalidate preflight work across stop/start, before an AbortController exists.
  let lifecycleVersion = 0;
  let unsubConnectivity: (() => void) | null = null;
  let unsubPrefs: (() => void) | null = null;
  let sessionAbort: AbortController | null = null;
  let sessionPromise: Promise<void> | null = null;
  /** After cancel, suppress auto-start until the next reachability→online edge. */
  let suppressAutoUntilOnlineEdge = false;
  /**
   * Drafting screen is focused and the app is in the foreground. Automatic
   * uploads wait until the hold lifts.
   */
  let draftingHold = Boolean(options?.initialDraftingHold);
  let holdChain: Promise<void> = Promise.resolve();
  let wasOnline = false;
  /**
   * Reachability was just published online. Only the next automatic session
   * may reuse that result; retries, interrupt rechecks and Sync Now probe.
   */
  let onlineJustConfirmed = false;
  let evaluateChain: Promise<void> = Promise.resolve();
  const schedule = deps.schedule ?? defaultSchedule;
  let pauseTimerCancel: (() => void) | null = null;
  let retryTimerCancel: (() => void) | null = null;
  let sessionFailures = 0;
  /** True from the moment a session begins until it fully unwinds. */
  let sessionOpen = false;
  /** Take saved (or similar) while a session was in flight. */
  let rerunAfterSession = false;
  /**
   * Write mark from before the last automatic check that cleanly found
   * nothing queued. Dropped by new work, a nonempty or failed read, and stop.
   */
  let confirmedEmpty: { mark: object; version: number } | null = null;
  let pendingWorkNotices = 0;

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
    currentChapter,
    holdReason: draftingHold ? 'drafting' : null,
  });

  const isUserPaused = (): boolean => {
    const until = deps.getPausedUntilMs();
    return until !== null && deps.now() < until;
  };

  const chapterKey = (chapter: PendingUploadChapter): string =>
    `${chapter.bookId}:${chapter.chapterNumber}`;

  const clearSessionCounts = (): void => {
    completedChapters = 0;
    totalChapters = 0;
    currentChapter = null;
    sessionKeys = new Set();
  };

  /**
   * Fold the latest pending set into the frozen session. Completed is how many
   * session keys are no longer pending, and it never drops below the last
   * value. New pending keys join the session so Y can grow without resetting
   * X to 0 (#600).
   */
  const applyPendingChapters = (pending: PendingUploadChapter[]): void => {
    const pendingKeys = new Set(pending.map(chapterKey));
    for (const key of pendingKeys) {
      sessionKeys.add(key);
    }
    let finished = 0;
    for (const key of sessionKeys) {
      if (!pendingKeys.has(key)) {
        finished += 1;
      }
    }
    completedChapters = Math.max(completedChapters, finished);
    totalChapters = sessionKeys.size;
  };

  const abortActiveSession = async (): Promise<void> => {
    const abort = sessionAbort;
    const promise = sessionPromise;
    abort?.abort();
    if (promise) {
      try {
        await promise;
      } catch {
        // aborted / failed sessions are expected
      }
    }
    // A stopped lifecycle may already have been replaced while this unwinds.
    if (sessionAbort === abort) sessionAbort = null;
    if (sessionPromise === promise) sessionPromise = null;
  };

  const applyFreshTransportSnapshot = async (
    allowRecent = false,
  ): Promise<void> => {
    if (!deps.getSessionTransportSnapshot) {
      return;
    }

    const version = lifecycleVersion;
    const snapshot = await deps.getSessionTransportSnapshot({ allowRecent });
    if (!started || version !== lifecycleVersion) return;
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
      deps.setPausedUntilMs(null);
      evaluateAuto();
      return;
    }
    pauseTimerCancel = schedule(() => {
      pauseTimerCancel = null;
      deps.setPausedUntilMs(null);
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

  /**
   * After a thrown transport interrupt there may be no NetInfo edge. Match
   * connectivity pause cleanup, then re-probe via session transport snapshot
   * after a nonzero delay (never 0ms) before evaluateAuto (#600).
   */
  function scheduleTransportRecheckAfterInterrupt(): void {
    clearRetryTimer();
    const delayMs = sessionRetryDelayMs(1);
    log.info('Scheduling upload transport recheck after network interrupt', {
      delayMs,
    });
    retryTimerCancel = schedule(() => {
      retryTimerCancel = null;
      void (async () => {
        await applyFreshTransportSnapshot();
        evaluateAuto();
      })();
    }, delayMs);
  }

  const readPendingWork = (onError?: () => void) =>
    Promise.all([
      deps.getPendingUploadChapters(onError),
      deps.hasPendingStageAdvances
        ? deps.hasPendingStageAdvances()
        : Promise.resolve(false),
      deps.hasPendingClaims ? deps.hasPendingClaims() : Promise.resolve(false),
    ]);

  const runSession = async (reason: 'auto' | 'sync_now'): Promise<void> => {
    if (!started) return;
    const version = lifecycleVersion;
    if (sessionPromise || sessionOpen) {
      rerunAfterSession = true;
      return;
    }
    sessionOpen = true;
    // Object so the async work closure can publish the outcome. A bare `let`
    // is narrowed to its initializer at `finally`, which hides the assignment.
    const sessionResult: { followUp: 'none' | 'retry' } = { followUp: 'none' };
    let heldRecordingsChecked = false;
    let membershipChecked = false;
    const reconcileHeld = async (): Promise<boolean> => {
      // Membership first, once per session: reconciliation can only compare
      // against cached `user_projects`, so a removal that happened offline is
      // invisible until the server answers (#848).
      if (!membershipChecked) {
        membershipChecked = true;
        if (deps.refreshMembershipBeforeUpload) {
          try {
            await deps.refreshMembershipBeforeUpload();
          } catch (error) {
            log.warn('Project membership refresh failed; deferring uploads', {
              error,
            });
            // Same contract as a failed reconcile: count the attempt and ask
            // the `finally` for a retry. Nothing is uploaded against a cache
            // we could not verify.
            sessionFailures += 1;
            sessionResult.followUp = 'retry';
            return true;
          }
        }
      }
      if (!deps.reconcileHeldBeforeUpload) return false;
      heldRecordingsChecked = true;
      try {
        const outcome = await deps.reconcileHeldBeforeUpload();
        if (outcome.held > 0) {
          // Takes newly held are excluded from the pending query, so pending
          // work in other projects/chapters can still run this session (#855).
          log.info('Held recordings present; continuing with pending work', {
            reconcileHeld: outcome.held,
          });
        }
      } catch (error) {
        log.warn('Held-recording membership reconcile failed; holding', {
          error,
        });
        // Match the other failure paths: count the attempt and ask the
        // `finally` below for a retry. Counting matters because
        // `sessionRetryDelayMs(0)` is 0ms, so an uncounted retry would
        // re-enter this session immediately and loop on a persistent failure.
        sessionFailures += 1;
        sessionResult.followUp = 'retry';
        return true;
      }
      return false;
    };

    try {
      if (!deps.worker) {
        log.info('No chapter upload worker registered; skipping session', {
          reason,
        });
        phase = isUserPaused() ? 'paused' : 'idle';
        deps.emit({ type: 'idle' });
        return;
      }

      const allowRecent = reason === 'auto' && onlineJustConfirmed;
      onlineJustConfirmed = false;
      if (
        reason === 'auto' &&
        !isUserPaused() &&
        !suppressAutoUntilOnlineEdge &&
        !draftingHold
      ) {
        // Held takes are excluded from the pending query. Reconcile them
        // before the empty-queue shortcut so restored membership can requeue
        // them for this same automatic session.
        if (await reconcileHeld()) return;
        // Nothing queued means nothing for `/health` to gate. A clean empty
        // answer holds while no row is written and no work is announced.
        // Work that is queued is re-read after the probe below, as before.
        const notices = pendingWorkNotices;
        const mark = deps.getQueueWriteMark
          ? await deps.getQueueWriteMark().catch(() => null)
          : null;
        if (!started || version !== lifecycleVersion) return;
        const known = confirmedEmpty;
        confirmedEmpty = null;
        let nothingQueued =
          mark !== null &&
          known !== null &&
          known.version === version &&
          notices === pendingWorkNotices &&
          deps.sameQueueWriteMark?.(known.mark, mark) === true;
        let cleanRead = nothingQueued;
        if (!nothingQueued) {
          let readFailed = false;
          const [queued, hasStageWork, hasClaimWork] = await readPendingWork(
            () => {
              readFailed = true;
            },
          );
          if (!started || version !== lifecycleVersion) return;
          nothingQueued = queued.length === 0 && !hasStageWork && !hasClaimWork;
          cleanRead = !readFailed;
        }
        if (
          nothingQueued &&
          !isUserPaused() &&
          !suppressAutoUntilOnlineEdge &&
          !draftingHold
        ) {
          if (mark && cleanRead && notices === pendingWorkNotices) {
            confirmedEmpty = { mark, version };
          }
          phase = 'idle';
          clearSessionCounts();
          deps.emit({ type: 'idle' });
          return;
        }
      }
      await applyFreshTransportSnapshot(allowRecent);
      if (!started || version !== lifecycleVersion) return;

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
      if (reason === 'auto' && draftingHold) {
        return;
      }

      // #848 / #855: refresh membership from the server, then reconcile held
      // rows against it, before evaluating uploads. `reconcileHeld` runs the
      // refresh once per session and returns true (deferring the session) when
      // either step fails, so a user removed while offline cannot reach an
      // upload attempt and a terminal failure (database lock / failed
      // transaction) cannot delete or fail those takes here.
      if (!heldRecordingsChecked && (await reconcileHeld())) return;
      if (!started || version !== lifecycleVersion) return;

      const [chapters, hasStageWork, hasClaimWork] = await readPendingWork();
      if (!started || version !== lifecycleVersion) return;
      // Controls and connectivity may change while the queue read is pending,
      // before there is an AbortController for pause/cancel/offline to abort.
      if (isUserPaused()) {
        phase = 'paused';
        armPauseTimer();
        return;
      }
      if (suppressAutoUntilOnlineEdge) {
        return;
      }
      if (reason === 'auto' && draftingHold) {
        return;
      }
      const currentGate = transportAllowsTransfer({
        isOnline,
        isWifi,
        connectionType,
        uploadOverCellular: deps.getUploadOverCellular(),
      });
      if (currentGate !== 'ok') {
        const enteredWaitingWifi =
          currentGate === 'waiting_wifi' && phase !== 'waiting_wifi';
        phase = currentGate;
        if (enteredWaitingWifi) {
          deps.emit({ type: 'waiting_wifi' });
        }
        return;
      }
      const stageOnly = chapters.length === 0;
      if (stageOnly && !hasStageWork && !hasClaimWork) {
        phase = 'idle';
        clearSessionCounts();
        deps.emit({ type: 'idle' });
        return;
      }

      const abort = new AbortController();
      sessionAbort = abort;
      // Pause/Resume continues the same chapter keys. Counting `pending.length`
      // treats a failed chapter that stayed queued, or a chapter recorded during
      // the pause, as a smaller X (#600). Connectivity abort sets phase to
      // `offline` while keeping sessionKeys — resume that too so progress is
      // not reset to zero (#600). Lock syncing before the claim push so Cancel
      // cannot start a second session (#611).
      if (stageOnly) {
        // No take progress to show; HomeScreen refreshes on `complete` after
        // the drain so a mounted My Work list can drop the yellow row (#257).
        // Claim-only reconnects take the same path (#886).
        phase = 'syncing';
        log.info('Upload session draining queued claims / stage advances', {
          reason,
          hasStageWork,
          hasClaimWork,
        });
      } else {
        const resumePausedSession =
          (phase === 'paused' || phase === 'offline') && sessionKeys.size > 0;
        if (resumePausedSession) {
          applyPendingChapters(chapters);
          phase = 'syncing';
          deps.emit({
            type: 'progress',
            completedChapters,
            totalChapters,
          });
          log.info('Upload session resumed', {
            reason,
            completedChapters,
            totalChapters,
          });
        } else {
          sessionKeys = new Set();
          completedChapters = 0;
          applyPendingChapters(chapters);
          phase = 'syncing';
          deps.emit({ type: 'start', totalChapters });
          log.info('Upload session started', {
            reason,
            totalChapters,
          });
        }
      }

      const work = (async () => {
        const raceAbort = (task: Promise<void>): Promise<void> =>
          Promise.race([
            task,
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

        try {
          // Claims must land before takes — reconnect auto-upload and Sync Now
          // otherwise race the full sync's claim step (~30s of master data) (#611).
          // Race abort so Cancel/pause do not hang on the claim round-trip.
          // A drain-only session must not `complete` over a claim that is
          // still queued; remember the soft failure, still drain the stage
          // rows below, and fail the session afterwards so the bounded retry
          // runs (#886, same shape as `deletionsFailed`).
          let claimPushError: unknown = null;
          if (deps.pushPendingClaimsBeforeUpload) {
            try {
              await raceAbort(deps.pushPendingClaimsBeforeUpload());
            } catch (error) {
              if (abort.signal.aborted) {
                return;
              }
              // Offline at claim time is deferred work for the whole session,
              // not something to upload past: take the connectivity-pause
              // path below instead of a silent "continuing" (#886).
              if (
                isUploadNetworkInterruptedError(error) ||
                isAuthError(error)
              ) {
                throw error;
              }
              if (stageOnly) {
                claimPushError = error;
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
          // Deletes before takes, once per session (#886). A terminal
          // delete failure must not starve the chapters below: remember it
          // and fail the session only after they have had their turn.
          let deletionsFailed = 0;
          if (!stageOnly && deps.worker!.drainPendingDeletions) {
            const drained = await deps.worker!.drainPendingDeletions(
              abort.signal,
            );
            deletionsFailed = drained.failed;
          }
          if (abort.signal.aborted) {
            return;
          }
          for (const chapter of chapters) {
            if (abort.signal.aborted) {
              return;
            }
            // Per-take progress inside this chapter (#886). Chapter
            // counts stay the headline; the worker reports after each take.
            let sawTakeProgress = false;
            const onTakeProgress: TakeProgressListener = progress => {
              if (abort.signal.aborted || version !== lifecycleVersion) {
                return;
              }
              sawTakeProgress = true;
              currentChapter = {
                bookId: chapter.bookId,
                chapterNumber: chapter.chapterNumber,
                ...progress,
              };
              deps.emit({
                type: 'progress',
                completedChapters,
                totalChapters,
                currentChapter,
              });
            };
            try {
              await deps.worker!.uploadChapter(
                chapter,
                abort.signal,
                onTakeProgress,
              );
            } finally {
              currentChapter = null;
            }
            if (abort.signal.aborted) {
              return;
            }
            const pending = await deps.getPendingUploadChapters();
            if (abort.signal.aborted || version !== lifecycleVersion) {
              return;
            }
            const before = completedChapters;
            applyPendingChapters(pending);
            // Also emit when take progress was shown so listeners drop the
            // per-take detail at the chapter boundary (#886).
            if (completedChapters > before || sawTakeProgress) {
              deps.emit({
                type: 'progress',
                completedChapters,
                totalChapters,
              });
            }
          }
          if (abort.signal.aborted) {
            return;
          }
          // Takes first, then Peer Check — PATCH-before-upload 404s (#257).
          if (deps.pushPendingStageAdvancesAfterUpload) {
            try {
              await raceAbort(deps.pushPendingStageAdvancesAfterUpload());
            } catch (error) {
              if (abort.signal.aborted) {
                return;
              }
              // Takes are already uploaded; surface the failure so the session
              // does not emit `complete` and the bounded retry re-drains the
              // stage (#257). Retry sessions run stage-only. My Work stays
              // yellow meanwhile (the row is held by the pending stage), so
              // skipping the refresh here is intentional.
              throw error;
            }
          }
          if (deletionsFailed > 0) {
            // Honest terminal summary: work remains, so no `complete` and no
            // cleared retry budget (#886).
            throw new Error(
              `Upload session left ${deletionsFailed} take delete(s) pending`,
            );
          }
          if (claimPushError !== null) {
            throw claimPushError;
          }
          if (!abort.signal.aborted) {
            phase = 'idle';
            log.info('Upload session complete', { totalChapters });
            // Clear before terminal emit so sync listeners (getSnapshot) never
            // observe stale completed/total after complete (#600).
            clearSessionCounts();
            deps.emit({ type: 'complete' });
            sessionFailures = 0;
            clearRetryTimer();
          }
        } catch (error) {
          if (abort.signal.aborted) {
            return;
          }
          if (isUploadNetworkInterruptedError(error)) {
            // Match onConnectivity drop: keep sessionKeys, clear retry budget,
            // and mark link offline so evaluateAuto cannot assume reachability
            // without a fresh snapshot / NetInfo edge (#600).
            log.info('Upload session paused after network drop', { error });
            clearRetryTimer();
            sessionFailures = 0;
            isOnline = false;
            wasOnline = false;
            onlineJustConfirmed = false;
            phase = 'offline';
            deps.emit({ type: 'paused', reason: 'connectivity' });
            scheduleTransportRecheckAfterInterrupt();
            return;
          }
          log.error('Upload session failed', { error });
          onlineJustConfirmed = false;
          phase = 'idle';
          clearSessionCounts();
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
      // Late preflight results must not unlock or schedule a newer lifecycle.
      if (version === lifecycleVersion) {
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
    }
  };

  const evaluateAuto = (): void => {
    evaluateChain = evaluateChain
      .then(async () => {
        if (!started) return;
        if (draftingHold) {
          return;
        }
        const gate = transportAllowsTransfer({
          isOnline,
          isWifi,
          connectionType,
          uploadOverCellular: deps.getUploadOverCellular(),
        });

        if (gate === 'offline') {
          // Offline transitions are handled immediately in onConnectivity.
          // An expired pause must not keep the Sync page on Paused.
          if (phase !== 'paused' || !isUserPaused()) {
            const leftPause = phase === 'paused';
            phase = 'offline';
            if (leftPause) {
              deps.emit({ type: 'idle' });
            }
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
    onlineJustConfirmed = online;
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

  const applyDraftingHold = async (held: boolean): Promise<void> => {
    const changed = draftingHold !== held;
    if (held) {
      // Do not abort an in-flight session. The hold only blocks the next
      // automatic start.
      draftingHold = true;
      if (changed && started) {
        // Make the hold visible: the Sync page re-reads the snapshot on any
        // session event and shows "waiting" instead of "pending" (#886).
        deps.emit({ type: 'hold', held: true, reason: 'drafting' });
      }
      return;
    }

    draftingHold = false;
    if (!started) {
      return;
    }
    if (changed) {
      deps.emit({ type: 'hold', held: false, reason: 'drafting' });
    }
    evaluateAuto();
  };

  return {
    start() {
      if (started) {
        return;
      }
      started = true;
      lifecycleVersion += 1;
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
      lifecycleVersion += 1;
      unsubConnectivity?.();
      unsubPrefs?.();
      unsubConnectivity = null;
      unsubPrefs = null;
      clearPauseTimer();
      clearRetryTimer();
      sessionFailures = 0;
      rerunAfterSession = false;
      onlineJustConfirmed = false;
      confirmedEmpty = null;
      void abortActiveSession();
      // Detach the old lifecycle immediately, including unresolved preflight.
      sessionAbort = null;
      sessionPromise = null;
      sessionOpen = false;
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
      clearSessionCounts();
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
      const inFlight = sessionPromise;
      if (inFlight) {
        // A session is actively uploading. Since #886 the session abort
        // reaches the in-flight PUT, so restarting here would discard a
        // transfer in progress and replay it from byte zero. Join the running
        // session, then run an explicit sync_now pass so the user's request
        // keeps its contract (ignores the drafting hold, not deferred behind
        // a session retry timer). Preflight-only sessions (sessionOpen
        // without a promise) have nothing in flight and are still restarted
        // below.
        try {
          await inFlight;
        } catch {
          // aborted / failed sessions are expected
        }
        if (!started) return;
        clearRetryTimer();
        sessionFailures = 0;
        await runSession('sync_now');
        return;
      }
      await abortActiveSession();
      await runSession('sync_now');
    },

    notifyPendingWork() {
      confirmedEmpty = null;
      pendingWorkNotices += 1;
      if (!started) {
        return;
      }
      if (sessionPromise || sessionOpen) {
        rerunAfterSession = true;
        return;
      }
      evaluateAuto();
    },

    setDraftingHold(held: boolean): Promise<void> {
      const task = holdChain.then(() => applyDraftingHold(held));
      holdChain = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },

    getSnapshot: snapshot,
  };
}
