import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  SESSION_RETRY_MAX_ATTEMPTS,
  sessionRetryDelayMs,
  type ChapterUploadWorker,
  type TakeProgressListener,
  type UploadOrchestratorDeps,
} from './uploadOrchestratorCore';
import type { UploadSessionEvent } from './syncEvents';
import type { PendingUploadChapter } from '../db/queries';
import { UploadNetworkInterruptedError } from '../utils/networkError';
import { AuthError } from './authError';

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

type ConnListener = (
  isOnline: boolean,
  isWifi: boolean,
  isCellular?: boolean,
  connectionType?: string,
) => void;

type ScheduledTimer = {
  callback: () => void;
  delayMs: number;
  cancelled: boolean;
};

function createHarness(options?: {
  chapters?: PendingUploadChapter[];
  uploadOverCellular?: boolean;
  workerDelayMs?: number;
  /** Drop the first chapter, then block until abort (it already left the pending set). */
  holdFirstChapterUntilAbort?: boolean;
  /** Leave these chapters pending after uploadChapter returns (failed take still queued). */
  retainPending?: PendingUploadChapter[];
  /** Block this chapter until abort without removing it from the pending set. */
  holdChapterNumber?: number;
  failUploads?: () => boolean;
  /** Throw once when upload reaches this chapterNumber, before drop (stays pending). */
  networkInterruptOnChapter?: number;
  getSessionTransportSnapshot?: UploadOrchestratorDeps['getSessionTransportSnapshot'];
  getPendingUploadChapters?: UploadOrchestratorDeps['getPendingUploadChapters'];
  pushPendingClaimsBeforeUpload?: UploadOrchestratorDeps['pushPendingClaimsBeforeUpload'];
  pushPendingStageAdvancesAfterUpload?: UploadOrchestratorDeps['pushPendingStageAdvancesAfterUpload'];
  hasPendingStageAdvances?: UploadOrchestratorDeps['hasPendingStageAdvances'];
  hasPendingClaims?: UploadOrchestratorDeps['hasPendingClaims'];
  refreshMembershipBeforeUpload?: UploadOrchestratorDeps['refreshMembershipBeforeUpload'];
  reconcileHeldBeforeUpload?: UploadOrchestratorDeps['reconcileHeldBeforeUpload'];
  getQueueWriteMark?: UploadOrchestratorDeps['getQueueWriteMark'];
  sameQueueWriteMark?: UploadOrchestratorDeps['sameQueueWriteMark'];
  /** Worker-owned once-per-session delete drain (#886). */
  drainPendingDeletions?: ChapterUploadWorker['drainPendingDeletions'];
  initialDraftingHold?: boolean;
  /**
   * Report this many takes per chapter through the per-take callback before
   * the chapter completes (#886). `failedTakes` of them fail.
   */
  takesPerChapter?: { total: number; failed?: number; delayMs?: number };
  /** Hand the per-take listener to the test (stale-listener checks). */
  captureTakeProgress?: (listener: TakeProgressListener | undefined) => void;
}) {
  let connListener: ConnListener | null = null;
  let prefListener: ((value: boolean) => void) | null = null;
  let uploadOverCellular = options?.uploadOverCellular ?? false;
  let pausedUntilMs: number | null = null;
  let nowMs = 1_000_000;
  const events: UploadSessionEvent[] = [];
  const uploaded: PendingUploadChapter[] = [];
  let chapters = options?.chapters ?? [
    { bookId: 1, chapterNumber: 1 },
    { bookId: 1, chapterNumber: 2 },
  ];

  let heldFirstChapter = false;
  let heldChapterNumber = false;
  let didNetworkInterrupt = false;
  const sameChapter = (
    left: PendingUploadChapter,
    right: PendingUploadChapter,
  ) =>
    left.bookId === right.bookId && left.chapterNumber === right.chapterNumber;
  const dropChapter = (chapter: PendingUploadChapter) => {
    chapters = chapters.filter(item => !sameChapter(item, chapter));
  };
  const waitForAbort = (signal: AbortSignal) =>
    new Promise<void>((_resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('aborted'));
        return;
      }
      signal.addEventListener('abort', () => reject(new Error('aborted')), {
        once: true,
      });
    });
  const timers: ScheduledTimer[] = [];

  const worker: ChapterUploadWorker = {
    drainPendingDeletions: options?.drainPendingDeletions,
    uploadChapter: async (chapter, signal, onTakeProgress) => {
      options?.captureTakeProgress?.(onTakeProgress);
      if (options?.failUploads?.()) {
        throw new Error('upload failed');
      }
      if (options?.takesPerChapter) {
        const { total, failed = 0, delayMs = 0 } = options.takesPerChapter;
        onTakeProgress?.({
          completedTakes: 0,
          failedTakes: 0,
          totalTakes: total,
        });
        for (let take = 1; take <= total; take += 1) {
          await new Promise<void>(resolve => setTimeout(resolve, delayMs));
          const failedSoFar = Math.min(failed, take);
          onTakeProgress?.({
            completedTakes: take - failedSoFar,
            failedTakes: failedSoFar,
            totalTakes: total,
          });
        }
        if (failed > 0) {
          throw new Error(`Chapter upload failed for ${failed} recording(s)`);
        }
      }
      if (options?.holdFirstChapterUntilAbort && !heldFirstChapter) {
        heldFirstChapter = true;
        dropChapter(chapter);
        uploaded.push(chapter);
        await waitForAbort(signal);
        return;
      }
      if (
        options?.holdChapterNumber === chapter.chapterNumber &&
        !heldChapterNumber
      ) {
        heldChapterNumber = true;
        uploaded.push(chapter);
        await waitForAbort(signal);
        return;
      }
      if (options?.workerDelayMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, options.workerDelayMs);
          const onAbort = () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        });
      }
      if (signal.aborted) {
        throw new Error('aborted');
      }
      // Interrupt once before drop so this chapter stays pending; earlier
      // chapters may already have emitted progress (#600).
      if (
        options?.networkInterruptOnChapter === chapter.chapterNumber &&
        !didNetworkInterrupt
      ) {
        didNetworkInterrupt = true;
        throw new UploadNetworkInterruptedError('link dropped mid-session');
      }
      uploaded.push(chapter);
      const retained = options?.retainPending?.some(item =>
        sameChapter(item, chapter),
      );
      if (!retained) {
        dropChapter(chapter);
      }
    },
  };

  const deps: UploadOrchestratorDeps = {
    subscribeToConnectivity: onChange => {
      connListener = onChange;
      return () => {
        connListener = null;
      };
    },
    getUploadOverCellular: () => uploadOverCellular,
    subscribeToUploadOverCellular: listener => {
      prefListener = listener;
      return () => {
        prefListener = null;
      };
    },
    // Copy so in-loop dropChapter cannot skip later chapters in the session list.
    getPendingUploadChapters:
      options?.getPendingUploadChapters ?? (async () => [...chapters]),
    getPausedUntilMs: () => pausedUntilMs,
    setPausedUntilMs: ms => {
      pausedUntilMs = ms;
    },
    now: () => nowMs,
    pauseWindowMs: PAUSE_WINDOW_MS,
    worker,
    emit: event => {
      events.push(event);
    },
    getSessionTransportSnapshot: options?.getSessionTransportSnapshot,
    schedule: (callback, delayMs) => {
      const timer: ScheduledTimer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    pushPendingClaimsBeforeUpload: options?.pushPendingClaimsBeforeUpload,
    pushPendingStageAdvancesAfterUpload:
      options?.pushPendingStageAdvancesAfterUpload,
    hasPendingStageAdvances: options?.hasPendingStageAdvances,
    hasPendingClaims: options?.hasPendingClaims,
    refreshMembershipBeforeUpload: options?.refreshMembershipBeforeUpload,
    reconcileHeldBeforeUpload: options?.reconcileHeldBeforeUpload,
    getQueueWriteMark: options?.getQueueWriteMark,
    sameQueueWriteMark: options?.sameQueueWriteMark,
  };

  const orchestrator = createUploadOrchestrator(deps, {
    initialDraftingHold: options?.initialDraftingHold,
  });
  orchestrator.start();

  return {
    orchestrator,
    events,
    uploaded,
    setChapters: (next: PendingUploadChapter[]) => {
      chapters = next;
    },
    setNow: (ms: number) => {
      nowMs = ms;
    },
    setCellularPref: (value: boolean) => {
      uploadOverCellular = value;
      prefListener?.(value);
    },
    emitConnectivity: (
      isOnline: boolean,
      isWifi: boolean,
      connectionType?: string,
    ) => {
      connListener?.(isOnline, isWifi, undefined, connectionType);
    },
    getPausedUntilMs: () => pausedUntilMs,
    pendingTimers: () => timers.filter(timer => !timer.cancelled),
    fireTimer: (delayMs: number) => {
      const timer = timers.find(
        entry => !entry.cancelled && entry.delayMs === delayMs,
      );
      if (!timer) {
        throw new Error(`no timer scheduled for ${delayMs}ms`);
      }
      timer.cancelled = true;
      timer.callback();
    },
    flush: async () => {
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      });
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      });
    },
    waitFor: async (
      predicate: () => boolean,
      timeoutMs = 500,
    ): Promise<void> => {
      const start = Date.now();
      while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
          throw new Error('waitFor timed out');
        }
        await new Promise<void>(resolve => {
          setTimeout(resolve, 10);
        });
      }
    },
  };
}

describe('uploadOrchestrator', () => {
  it('auto-uploads on Wi‑Fi when pending chapters exist (online = server reachable)', async () => {
    const h = createHarness();
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([
      { bookId: 1, chapterNumber: 1 },
      { bookId: 1, chapterNumber: 2 },
    ]);
    expect(h.events.some(e => e.type === 'start')).toBe(true);
    expect(h.events.some(e => e.type === 'complete')).toBe(true);
    expect(h.orchestrator.getSnapshot().phase).toBe('idle');
  });

  it('emits a fixed, monotonic chapter total for a multi-chapter session (#600)', async () => {
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
        { bookId: 1, chapterNumber: 3 },
      ],
    });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(h.events).toEqual([
      { type: 'start', totalChapters: 3 },
      { type: 'progress', completedChapters: 1, totalChapters: 3 },
      { type: 'progress', completedChapters: 2, totalChapters: 3 },
      { type: 'progress', completedChapters: 3, totalChapters: 3 },
      { type: 'complete' },
    ]);
  });

  it('clears session counts before complete/cancel so sync listeners see 0/0 (#600)', async () => {
    async function runTerminal(opts: {
      terminal: 'complete' | 'cancelled';
      drive: (
        orchestrator: ReturnType<typeof createUploadOrchestrator>,
        releaseHold: () => void,
      ) => Promise<void>;
    }) {
      let chapters: PendingUploadChapter[] = [{ bookId: 5, chapterNumber: 1 }];
      const connBox: { current: ConnListener | null } = { current: null };
      let releaseHold!: () => void;
      const hold = new Promise<void>(resolve => {
        releaseHold = resolve;
      });
      const snapshots: Array<{
        type: string;
        completedChapters: number;
        totalChapters: number;
      }> = [];
      const orchestrator = createUploadOrchestrator({
        subscribeToConnectivity: onChange => {
          connBox.current = onChange;
          return () => undefined;
        },
        getUploadOverCellular: () => false,
        subscribeToUploadOverCellular: () => () => undefined,
        getPendingUploadChapters: async () => chapters,
        getPausedUntilMs: () => null,
        setPausedUntilMs: () => undefined,
        now: () => 1_000_000,
        pauseWindowMs: PAUSE_WINDOW_MS,
        worker: {
          uploadChapter: async (_chapter, signal) => {
            await Promise.race([
              hold,
              new Promise<never>((_resolve, reject) => {
                if (signal.aborted) {
                  reject(new Error('aborted'));
                  return;
                }
                signal.addEventListener(
                  'abort',
                  () => reject(new Error('aborted')),
                  { once: true },
                );
              }),
            ]);
            if (signal.aborted) {
              throw new Error('aborted');
            }
            chapters = [];
          },
        },
        emit: event => {
          if (event.type === opts.terminal) {
            const snap = orchestrator.getSnapshot();
            snapshots.push({
              type: event.type,
              completedChapters: snap.completedChapters,
              totalChapters: snap.totalChapters,
            });
          }
        },
      });
      orchestrator.start();
      if (!connBox.current) {
        throw new Error('expected connectivity subscription');
      }
      connBox.current(true, true, false, 'wifi');
      await new Promise<void>(r => setTimeout(r, 20));
      await opts.drive(orchestrator, releaseHold);
      const waitStart = Date.now();
      while (!snapshots.some(s => s.type === opts.terminal)) {
        if (Date.now() - waitStart > 2000) {
          throw new Error(
            `timed out waiting for ${opts.terminal}; got ${JSON.stringify(
              snapshots,
            )}`,
          );
        }
        await new Promise<void>(r => setTimeout(r, 10));
      }
      expect(snapshots).toContainEqual({
        type: opts.terminal,
        completedChapters: 0,
        totalChapters: 0,
      });
    }

    await runTerminal({
      terminal: 'complete',
      drive: async (_orchestrator, releaseHold) => {
        releaseHold();
      },
    });

    await runTerminal({
      terminal: 'cancelled',
      drive: async (orchestrator, releaseHold) => {
        const cancelPromise = orchestrator.cancel();
        releaseHold();
        await cancelPromise;
      },
    });
  });

  it('keeps exact progress after UploadNetworkInterruptedError mid-session (#600)', async () => {
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
        { bookId: 1, chapterNumber: 3 },
      ],
      // Chapter 1 completes and emits progress; chapter 2 throws and stays pending.
      networkInterruptOnChapter: 2,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() =>
      h.events.some(
        e =>
          e.type === 'progress' &&
          e.completedChapters === 1 &&
          e.totalChapters === 3,
      ),
    );
    await h.waitFor(() =>
      h.events.some(e => e.type === 'paused' && e.reason === 'connectivity'),
    );
    expect(h.orchestrator.getSnapshot()).toMatchObject({
      phase: 'offline',
      completedChapters: 1,
      totalChapters: 3,
    });
    expect(h.events.some(e => e.type === 'idle')).toBe(false);
    expect(h.events.some(e => e.type === 'complete')).toBe(false);

    const before = h.events.length;
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.events.some(e => e.type === 'complete'), 2000);
    const after = h.events.slice(before);
    expect(after.some(e => e.type === 'start')).toBe(false);
    expect(after[0]).toEqual({
      type: 'progress',
      completedChapters: 1,
      totalChapters: 3,
    });
  });

  it('recovers from thrown network interrupt via bounded recheck without NetInfo (#600)', async () => {
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
      ],
      networkInterruptOnChapter: 2,
      // Snapshot still reports online — no emitConnectivity after interrupt.
      getSessionTransportSnapshot: async () => ({
        isOnline: true,
        isWifi: true,
        connectionType: 'wifi',
      }),
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() =>
      h.events.some(
        e =>
          e.type === 'progress' &&
          e.completedChapters === 1 &&
          e.totalChapters === 2,
      ),
    );
    await h.waitFor(() =>
      h.events.some(e => e.type === 'paused' && e.reason === 'connectivity'),
    );
    expect(h.orchestrator.getSnapshot()).toMatchObject({
      phase: 'offline',
      completedChapters: 1,
      totalChapters: 2,
    });
    expect(h.pendingTimers().map(t => t.delayMs)).toEqual([
      sessionRetryDelayMs(1),
    ]);

    const before = h.events.length;
    h.fireTimer(sessionRetryDelayMs(1));
    await h.waitFor(() => h.events.some(e => e.type === 'complete'), 2000);
    const after = h.events.slice(before);
    expect(after.some(e => e.type === 'start')).toBe(false);
    expect(
      after.some(
        e =>
          e.type === 'progress' &&
          e.completedChapters === 1 &&
          e.totalChapters === 2,
      ),
    ).toBe(true);
  });

  it('deferred interrupt recheck stays offline when snapshot remains down (#600)', async () => {
    // Stay reachable until the interrupt so the session can make progress;
    // only the post-interrupt recheck sees persistent offline (no NetInfo).
    let snapshotOnline = true;
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
      ],
      networkInterruptOnChapter: 2,
      getSessionTransportSnapshot: async () => ({
        isOnline: snapshotOnline,
        isWifi: snapshotOnline,
        connectionType: snapshotOnline ? 'wifi' : 'none',
      }),
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() =>
      h.events.some(
        e =>
          e.type === 'progress' &&
          e.completedChapters === 1 &&
          e.totalChapters === 2,
      ),
    );
    await h.waitFor(() =>
      h.events.some(e => e.type === 'paused' && e.reason === 'connectivity'),
    );
    expect(h.orchestrator.getSnapshot()).toMatchObject({
      phase: 'offline',
      completedChapters: 1,
      totalChapters: 2,
    });
    expect(h.pendingTimers().map(t => t.delayMs)).toEqual([
      sessionRetryDelayMs(1),
    ]);

    snapshotOnline = false;
    h.fireTimer(sessionRetryDelayMs(1));
    await h.flush();
    await h.flush();
    expect(h.orchestrator.getSnapshot()).toMatchObject({
      phase: 'offline',
      completedChapters: 1,
      totalChapters: 2,
    });
    expect(h.events.some(e => e.type === 'complete')).toBe(false);
    expect(h.pendingTimers().filter(t => !t.cancelled)).toEqual([]);
  });

  it('keeps the session total when Resume follows a pause that finished the in-flight chapter (#600)', async () => {
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
        { bookId: 1, chapterNumber: 3 },
      ],
      holdFirstChapterUntilAbort: true,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.length === 1);

    await h.orchestrator.pause();

    expect(h.events).toEqual([
      { type: 'start', totalChapters: 3 },
      { type: 'paused', reason: 'user' },
    ]);

    await h.orchestrator.syncNow();
    await h.waitFor(() => h.events.some(event => event.type === 'complete'));

    expect(h.events).toEqual([
      { type: 'start', totalChapters: 3 },
      { type: 'paused', reason: 'user' },
      { type: 'progress', completedChapters: 1, totalChapters: 3 },
      { type: 'progress', completedChapters: 2, totalChapters: 3 },
      { type: 'progress', completedChapters: 3, totalChapters: 3 },
      { type: 'complete' },
    ]);
  });

  it('does not rewind progress when a failed chapter stays pending across pause (#600)', async () => {
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
      ],
      retainPending: [{ bookId: 1, chapterNumber: 1 }],
      holdChapterNumber: 2,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.length === 2);

    await h.orchestrator.pause();

    await h.orchestrator.syncNow();
    await h.waitFor(() => h.events.some(event => event.type === 'complete'));

    const progress = h.events.filter(event => event.type === 'progress');
    expect(progress.map(event => event.completedChapters)).toEqual([0, 1]);
    expect(progress.every(event => event.totalChapters === 2)).toBe(true);
  });

  it('keeps completed chapters when a new chapter is recorded during pause (#600)', async () => {
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
        { bookId: 1, chapterNumber: 3 },
      ],
      holdFirstChapterUntilAbort: true,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.length === 1);
    await h.orchestrator.pause();

    h.setChapters([
      { bookId: 1, chapterNumber: 2 },
      { bookId: 1, chapterNumber: 3 },
      { bookId: 1, chapterNumber: 4 },
    ]);
    await h.orchestrator.syncNow();
    await h.waitFor(() => h.events.some(event => event.type === 'complete'));

    expect(h.events).toEqual([
      { type: 'start', totalChapters: 3 },
      { type: 'paused', reason: 'user' },
      { type: 'progress', completedChapters: 1, totalChapters: 4 },
      { type: 'progress', completedChapters: 2, totalChapters: 4 },
      { type: 'progress', completedChapters: 3, totalChapters: 4 },
      { type: 'progress', completedChapters: 4, totalChapters: 4 },
      { type: 'complete' },
    ]);
  });

  it('pushes pending claims before uploading chapters (#611)', async () => {
    let releaseClaims!: () => void;
    const pushPendingClaimsBeforeUpload = jest.fn(
      () =>
        new Promise<void>(resolve => {
          releaseClaims = resolve;
        }),
    );
    const h = createHarness({
      pushPendingClaimsBeforeUpload,
      chapters: [{ bookId: 1, chapterNumber: 1 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(
      () => pushPendingClaimsBeforeUpload.mock.calls.length === 1,
    );
    await h.flush();
    expect(h.uploaded).toEqual([]);
    releaseClaims();
    await h.waitFor(() => h.uploaded.length === 1);
    expect(h.uploaded).toEqual([{ bookId: 1, chapterNumber: 1 }]);
  });

  it('drains stage advances after claims and takes (#257)', async () => {
    let releaseClaims!: () => void;
    let releaseStage!: () => void;
    const pushPendingClaimsBeforeUpload = jest.fn(
      () =>
        new Promise<void>(resolve => {
          releaseClaims = resolve;
        }),
    );
    const pushPendingStageAdvancesAfterUpload = jest.fn(
      () =>
        new Promise<void>(resolve => {
          releaseStage = resolve;
        }),
    );
    const h = createHarness({
      pushPendingClaimsBeforeUpload,
      pushPendingStageAdvancesAfterUpload,
      chapters: [{ bookId: 1, chapterNumber: 1 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(
      () => pushPendingClaimsBeforeUpload.mock.calls.length === 1,
    );
    await h.flush();
    expect(pushPendingStageAdvancesAfterUpload).not.toHaveBeenCalled();
    expect(h.uploaded).toEqual([]);

    releaseClaims();
    await h.waitFor(() => h.uploaded.length === 1);
    await h.flush();
    expect(h.uploaded).toEqual([{ bookId: 1, chapterNumber: 1 }]);
    await h.waitFor(
      () => pushPendingStageAdvancesAfterUpload.mock.calls.length === 1,
    );

    releaseStage();
    await h.flush();
    expect(
      pushPendingClaimsBeforeUpload.mock.invocationCallOrder[0],
    ).toBeLessThan(
      pushPendingStageAdvancesAfterUpload.mock.invocationCallOrder[0],
    );
  });

  it('uploads takes, then skips complete and schedules a retry when the stage drain rejects (#257)', async () => {
    const pushPendingStageAdvancesAfterUpload = jest
      .fn()
      .mockRejectedValue(new Error('stage network'));
    const h = createHarness({
      pushPendingStageAdvancesAfterUpload,
      chapters: [{ bookId: 3, chapterNumber: 2 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.length === 1);
    expect(pushPendingStageAdvancesAfterUpload).toHaveBeenCalledTimes(1);
    expect(h.uploaded).toEqual([{ bookId: 3, chapterNumber: 2 }]);
    // Takes uploaded, but the failed stage drain skips `complete` and retries.
    await h.flush();
    expect(h.events.some(event => event.type === 'complete')).toBe(false);
    expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([
      sessionRetryDelayMs(1),
    ]);
  });

  describe('once-per-session delete drain (#886)', () => {
    it('drains deletes once after the claim push and before the first chapter', async () => {
      const order: string[] = [];
      const pushPendingClaimsBeforeUpload = jest.fn(async () => {
        order.push('claims');
      });
      const drainPendingDeletions = jest.fn(async (signal: AbortSignal) => {
        expect(signal.aborted).toBe(false);
        order.push('deletes');
        return { failed: 0 };
      });
      const h = createHarness({
        pushPendingClaimsBeforeUpload,
        drainPendingDeletions,
        chapters: [
          { bookId: 1, chapterNumber: 1 },
          { bookId: 1, chapterNumber: 2 },
        ],
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'complete'));

      expect(drainPendingDeletions).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['claims', 'deletes']);
      expect(h.uploaded).toHaveLength(2);
    });

    it('still uploads every chapter when a delete fails terminally, then ends without complete and arms a retry', async () => {
      let failed = 1;
      const drainPendingDeletions = jest.fn(async () => ({ failed }));
      const h = createHarness({
        drainPendingDeletions,
        chapters: [
          { bookId: 1, chapterNumber: 1 },
          { bookId: 1, chapterNumber: 2 },
        ],
        // The chapter whose delete is still queued stays in the pending list
        // (getPendingUploadChapters lists deletion-only chapters).
        retainPending: [{ bookId: 1, chapterNumber: 2 }],
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.uploaded.length === 2);
      await h.flush();

      // Independent work progressed; the session is honest about the leftover.
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
      expect(h.events.at(-1)).toEqual({ type: 'idle' });
      expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([
        sessionRetryDelayMs(1),
      ]);

      // The retry re-drains; once the delete lands the session completes.
      failed = 0;
      h.fireTimer(sessionRetryDelayMs(1));
      await h.waitFor(() => h.events.some(event => event.type === 'complete'));
      expect(drainPendingDeletions).toHaveBeenCalledTimes(2);
    });

    it('a cancel during the drain uploads nothing and emits neither idle nor complete', async () => {
      let abortSeen = false;
      const drainPendingDeletions = jest.fn(
        (signal: AbortSignal) =>
          new Promise<{ failed: number }>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                abortSeen = true;
                reject(new Error('aborted'));
              },
              { once: true },
            );
          }),
      );
      const h = createHarness({
        drainPendingDeletions,
        chapters: [{ bookId: 1, chapterNumber: 1 }],
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => drainPendingDeletions.mock.calls.length === 1);

      await h.orchestrator.cancel();
      await h.flush();

      expect(abortSeen).toBe(true);
      expect(h.uploaded).toEqual([]);
      expect(h.events.some(event => event.type === 'cancelled')).toBe(true);
      expect(h.events.some(event => event.type === 'idle')).toBe(false);
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
    });

    it('does not block active stage work on another account deletion authentication', async () => {
      const drainPendingDeletions = jest
        .fn()
        .mockRejectedValue(new AuthError('inactive owner expired'));
      const pushPendingStageAdvancesAfterUpload = jest
        .fn()
        .mockResolvedValue(undefined);
      const h = createHarness({
        drainPendingDeletions,
        pushPendingStageAdvancesAfterUpload,
        chapters: [],
        hasPendingStageAdvances: async () => true,
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'complete'));
      expect(drainPendingDeletions).not.toHaveBeenCalled();
      expect(pushPendingStageAdvancesAfterUpload).toHaveBeenCalledTimes(1);
      expect(h.pendingTimers()).toEqual([]);
    });

    it('stops before takes when the claim push requires reauthentication', async () => {
      const h = createHarness({
        chapters: [{ bookId: 1, chapterNumber: 1 }],
        pushPendingClaimsBeforeUpload: async () => {
          throw new AuthError('owner expired');
        },
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'idle'));
      expect(h.uploaded).toEqual([]);
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
      // No takes after the auth failure; the bounded session retry applies.
      expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([
        sessionRetryDelayMs(1),
      ]);
    });

    it('treats a network interruption during the drain like one during a chapter', async () => {
      const drainPendingDeletions = jest
        .fn()
        .mockRejectedValue(new UploadNetworkInterruptedError('link dropped'));
      const h = createHarness({
        drainPendingDeletions,
        chapters: [{ bookId: 1, chapterNumber: 1 }],
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() =>
        h.events.some(
          event => event.type === 'paused' && event.reason === 'connectivity',
        ),
      );

      expect(h.uploaded).toEqual([]);
      expect(h.events.some(event => event.type === 'idle')).toBe(false);
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
      expect(h.orchestrator.getSnapshot()).toMatchObject({ phase: 'offline' });
    });
  });

  it('drains stage advances on reconnect when no takes are pending (#257)', async () => {
    const pushPendingClaimsBeforeUpload = jest
      .fn()
      .mockResolvedValue(undefined);
    const pushPendingStageAdvancesAfterUpload = jest
      .fn()
      .mockResolvedValue(undefined);
    const h = createHarness({
      chapters: [],
      hasPendingStageAdvances: async () => true,
      pushPendingClaimsBeforeUpload,
      pushPendingStageAdvancesAfterUpload,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.events.some(event => event.type === 'complete'));

    expect(h.uploaded).toEqual([]);
    expect(h.events.some(event => event.type === 'start')).toBe(false);
    expect(pushPendingClaimsBeforeUpload).toHaveBeenCalledTimes(1);
    expect(pushPendingStageAdvancesAfterUpload).toHaveBeenCalledTimes(1);
    expect(
      pushPendingClaimsBeforeUpload.mock.invocationCallOrder[0],
    ).toBeLessThan(
      pushPendingStageAdvancesAfterUpload.mock.invocationCallOrder[0],
    );
  });

  it('does not drain stages when the take queue and stage queue are both empty', async () => {
    const pushPendingStageAdvancesAfterUpload = jest.fn();
    const h = createHarness({
      chapters: [],
      hasPendingStageAdvances: async () => false,
      pushPendingStageAdvancesAfterUpload,
    });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(pushPendingStageAdvancesAfterUpload).not.toHaveBeenCalled();
    expect(h.events.some(event => event.type === 'complete')).toBe(false);
    expect(h.events.some(event => event.type === 'idle')).toBe(true);
  });

  it('does not emit complete until the stage-only drain finishes (#257)', async () => {
    let releaseStage!: () => void;
    const pushPendingStageAdvancesAfterUpload = jest.fn(
      () =>
        new Promise<void>(resolve => {
          releaseStage = resolve;
        }),
    );
    const h = createHarness({
      chapters: [],
      hasPendingStageAdvances: async () => true,
      pushPendingStageAdvancesAfterUpload,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(
      () => pushPendingStageAdvancesAfterUpload.mock.calls.length === 1,
    );
    expect(h.events.some(event => event.type === 'complete')).toBe(false);

    releaseStage();
    await h.waitFor(() => h.events.some(event => event.type === 'complete'));
  });

  it('retries a failed stage-only drain on reconnect (#257)', async () => {
    const pushPendingStageAdvancesAfterUpload = jest
      .fn()
      .mockRejectedValueOnce(new Error('stage network'))
      .mockResolvedValueOnce(undefined);
    const h = createHarness({
      chapters: [],
      hasPendingStageAdvances: async () => true,
      pushPendingStageAdvancesAfterUpload,
    });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(pushPendingStageAdvancesAfterUpload).toHaveBeenCalledTimes(1);
    expect(h.events.some(event => event.type === 'complete')).toBe(false);
    expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([
      sessionRetryDelayMs(1),
    ]);

    h.fireTimer(sessionRetryDelayMs(1));
    await h.waitFor(() => h.events.some(event => event.type === 'complete'));
    expect(pushPendingStageAdvancesAfterUpload).toHaveBeenCalledTimes(2);
  });

  it('still uploads when claim push rejects (#611 soft-continue)', async () => {
    const pushPendingClaimsBeforeUpload = jest
      .fn()
      .mockRejectedValue(new Error('claim network'));
    const h = createHarness({
      pushPendingClaimsBeforeUpload,
      chapters: [{ bookId: 3, chapterNumber: 2 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.length === 1);
    expect(pushPendingClaimsBeforeUpload).toHaveBeenCalledTimes(1);
    expect(h.uploaded).toEqual([{ bookId: 3, chapterNumber: 2 }]);
  });

  it('cancel during claim push aborts before uploading (#611)', async () => {
    let releaseClaims!: () => void;
    const pushPendingClaimsBeforeUpload = jest.fn(
      () =>
        new Promise<void>(resolve => {
          releaseClaims = resolve;
        }),
    );
    const h = createHarness({
      pushPendingClaimsBeforeUpload,
      chapters: [{ bookId: 1, chapterNumber: 1 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'syncing');
    await h.waitFor(
      () => pushPendingClaimsBeforeUpload.mock.calls.length === 1,
    );
    await h.orchestrator.cancel();
    releaseClaims();
    await h.waitFor(() => h.events.some(e => e.type === 'cancelled'));
    expect(h.uploaded).toEqual([]);
  });

  it('does not start a second auto session while claims are in flight (#611)', async () => {
    let releaseClaims!: () => void;
    const pushPendingClaimsBeforeUpload = jest.fn(
      () =>
        new Promise<void>(resolve => {
          releaseClaims = resolve;
        }),
    );
    const h = createHarness({
      pushPendingClaimsBeforeUpload,
      chapters: [{ bookId: 1, chapterNumber: 1 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(
      () => pushPendingClaimsBeforeUpload.mock.calls.length === 1,
    );
    // Another online evaluate must not open a parallel session.
    h.emitConnectivity(true, true);
    await h.flush();
    expect(pushPendingClaimsBeforeUpload).toHaveBeenCalledTimes(1);
    releaseClaims();
    await h.waitFor(() => h.uploaded.length === 1);
  });

  it('starts one session when connectivity events overlap the transport probe (#599)', async () => {
    let releaseSnapshot!: () => void;
    let snapshotCalls = 0;
    const h = createHarness({
      getSessionTransportSnapshot: () => {
        snapshotCalls += 1;
        return new Promise(resolve => {
          releaseSnapshot = () =>
            resolve({
              isOnline: true,
              isWifi: true,
              connectionType: 'wifi',
            });
        });
      },
    });

    h.emitConnectivity(true, true);
    await h.waitFor(() => snapshotCalls === 1);
    h.emitConnectivity(true, true);
    h.emitConnectivity(true, true);
    await h.flush();
    expect(snapshotCalls).toBe(1);

    releaseSnapshot();
    await h.waitFor(() => h.events.some(e => e.type === 'complete'));
    expect(h.events.filter(e => e.type === 'start')).toHaveLength(1);
    expect(h.events.filter(e => e.type === 'complete')).toHaveLength(1);
    expect(h.uploaded).toHaveLength(2);
  });

  it('does not auto-upload on cellular when uploadOverCellular is false', async () => {
    const h = createHarness({ uploadOverCellular: false });
    h.emitConnectivity(true, false);
    await h.flush();

    expect(h.uploaded).toEqual([]);
    expect(h.orchestrator.getSnapshot().phase).toBe('waiting_wifi');
    expect(h.events.some(e => e.type === 'waiting_wifi')).toBe(true);
  });

  it('auto-uploads on cellular when uploadOverCellular is true', async () => {
    const h = createHarness({ uploadOverCellular: true });
    h.emitConnectivity(true, false);
    await h.flush();
    await h.flush();

    expect(h.uploaded).toHaveLength(2);
    expect(h.events.some(e => e.type === 'complete')).toBe(true);
  });

  it('does not auto-upload on non-wifi when connection type is omitted and toggle is off', async () => {
    const h = createHarness({ uploadOverCellular: false });
    h.emitConnectivity(true, false);
    await h.flush();
    await h.flush();

    expect(h.uploaded).toHaveLength(0);
    expect(h.events.some(e => e.type === 'waiting_wifi')).toBe(true);
  });

  it('auto-uploads on ethernet without the cellular toggle', async () => {
    const h = createHarness({ uploadOverCellular: false });
    h.emitConnectivity(true, false, 'ethernet');
    await h.flush();
    await h.flush();

    expect(h.uploaded).toHaveLength(2);
    expect(h.events.some(e => e.type === 'complete')).toBe(true);
  });

  it('silently pauses mid-upload when server becomes unreachable and resumes on restore', async () => {
    const h = createHarness({ workerDelayMs: 40 });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'syncing');

    h.emitConnectivity(false, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'offline');
    expect(
      h.events.some(e => e.type === 'paused' && e.reason === 'connectivity'),
    ).toBe(true);

    h.setChapters([{ bookId: 1, chapterNumber: 9 }]);
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.some(c => c.chapterNumber === 9));
    await h.waitFor(() => h.events.some(e => e.type === 'complete'));
  });

  it('syncNow joins an uploading session instead of aborting the in-flight chapter (#886)', async () => {
    // Each chapter takes 40ms; the abort signal now reaches the PUT, so a
    // restart would discard the transfer in progress.
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
      ],
      workerDelayMs: 40,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'syncing');

    const syncNow = h.orchestrator.syncNow();
    // No second `start`: the running session was not aborted and restarted.
    await h.waitFor(() => h.events.some(e => e.type === 'complete'));
    await syncNow;

    expect(h.uploaded.map(c => c.chapterNumber)).toEqual([1, 2]);
    expect(h.events.filter(e => e.type === 'start')).toHaveLength(1);
    // The explicit pass still runs after the join (nothing left → idle).
    await h.waitFor(() => h.events.some(e => e.type === 'idle'));
  });

  it('syncNow joined to an uploading session still runs under the drafting hold (#886)', async () => {
    const h = createHarness({
      chapters: [{ bookId: 1, chapterNumber: 1 }],
      workerDelayMs: 40,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'syncing');

    // Hold set and a new chapter saved while chapter 1 is still uploading.
    await h.orchestrator.setDraftingHold(true);
    h.setChapters([{ bookId: 1, chapterNumber: 2 }]);

    // Explicit Sync Now ignores the hold; the auto rerun alone would not.
    await h.orchestrator.syncNow();

    expect(h.uploaded.map(c => c.chapterNumber)).toEqual([1, 2]);
    expect(h.events.filter(e => e.type === 'start')).toHaveLength(2);
  });

  it('resumes offline sessions with existing keys instead of resetting progress (#600)', async () => {
    const h = createHarness({
      chapters: [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
      ],
      holdFirstChapterUntilAbort: true,
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.length === 1);
    // Keys locked at start; mid-chapter abort has not yet folded completed.
    expect(h.orchestrator.getSnapshot().totalChapters).toBe(2);

    h.emitConnectivity(false, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'offline');
    expect(h.orchestrator.getSnapshot().totalChapters).toBe(2);

    const eventsBeforeResume = h.events.length;
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.events.some(e => e.type === 'complete'));

    const resumeEvents = h.events.slice(eventsBeforeResume);
    // Must reuse session (progress), not emit a fresh start that zeroes X.
    expect(resumeEvents.some(e => e.type === 'start')).toBe(false);
    expect(
      resumeEvents.some(
        e =>
          e.type === 'progress' &&
          e.completedChapters >= 1 &&
          e.totalChapters >= 2,
      ),
    ).toBe(true);
  });

  it('cancel stops upload and does not auto-retry until a new online edge', async () => {
    const h = createHarness({ workerDelayMs: 40 });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'syncing');
    await h.orchestrator.cancel();
    await h.waitFor(() => h.events.some(e => e.type === 'cancelled'));

    const countAfterCancel = h.uploaded.length;

    // Still online — no new online edge → no auto retry
    h.emitConnectivity(true, true);
    await h.flush();
    await new Promise<void>(resolve => {
      setTimeout(resolve, 50);
    });
    expect(h.uploaded.length).toBe(countAfterCancel);

    // Offline then online → auto-upload re-fires
    h.emitConnectivity(false, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'offline');
    h.setChapters([{ bookId: 2, chapterNumber: 1 }]);
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.uploaded.some(c => c.bookId === 2));
  });

  it('Sync Now refreshes transport snapshot when orchestrator cache is stale offline', async () => {
    const h = createHarness({
      getSessionTransportSnapshot: async () => ({
        isOnline: true,
        isWifi: true,
        connectionType: 'wifi',
      }),
    });
    h.emitConnectivity(false, true);
    await h.flush();

    h.setChapters([{ bookId: 9, chapterNumber: 1 }]);
    await h.orchestrator.syncNow();
    await h.flush();

    expect(h.uploaded.some(c => c.bookId === 9)).toBe(true);
  });

  it('pause blocks auto-upload for 24h; Sync Now clears the window', async () => {
    const h = createHarness();
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    h.setChapters([{ bookId: 3, chapterNumber: 1 }]);
    await h.orchestrator.pause();

    expect(h.getPausedUntilMs()).toBe(1_000_000 + PAUSE_WINDOW_MS);
    expect(h.orchestrator.getSnapshot().phase).toBe('paused');

    h.emitConnectivity(true, true);
    await h.flush();
    expect(h.uploaded.some(c => c.bookId === 3)).toBe(false);

    await h.orchestrator.syncNow();
    await h.flush();

    expect(h.getPausedUntilMs()).toBeNull();
    expect(h.uploaded.some(c => c.bookId === 3)).toBe(true);
  });

  it('pausing again after Sync Now starts a fresh 24h window', async () => {
    const h = createHarness();
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    await h.orchestrator.pause();
    const firstUntil = h.getPausedUntilMs();

    h.setNow(1_000_000 + 60_000);
    await h.orchestrator.syncNow();
    await h.flush();

    h.setChapters([{ bookId: 4, chapterNumber: 1 }]);
    await h.orchestrator.pause();
    const secondUntil = h.getPausedUntilMs();

    expect(secondUntil).not.toBe(firstUntil);
    expect(secondUntil).toBe(1_000_000 + 60_000 + PAUSE_WINDOW_MS);
  });

  it('skips sessions when no worker is registered', async () => {
    let connListener: ConnListener | null = null;
    const events: UploadSessionEvent[] = [];
    const orchestrator = createUploadOrchestrator({
      subscribeToConnectivity: onChange => {
        connListener = onChange;
        return () => {
          connListener = null;
        };
      },
      getUploadOverCellular: () => false,
      subscribeToUploadOverCellular: () => () => undefined,
      getPendingUploadChapters: async () => [{ bookId: 1, chapterNumber: 1 }],
      getPausedUntilMs: () => null,
      setPausedUntilMs: () => undefined,
      now: () => 0,
      pauseWindowMs: PAUSE_WINDOW_MS,
      worker: null,
      emit: e => events.push(e),
    });
    orchestrator.start();
    connListener!(true, true);
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });

    expect(events.some(e => e.type === 'idle')).toBe(true);
    expect(orchestrator.getSnapshot().phase).toBe('idle');
  });

  it('starts an upload when a take is saved while already online', async () => {
    const h = createHarness({ chapters: [] });
    h.emitConnectivity(true, true);
    await h.flush();
    expect(h.uploaded).toEqual([]);

    h.setChapters([{ bookId: 8, chapterNumber: 4 }]);
    h.orchestrator.notifyPendingWork();
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([{ bookId: 8, chapterNumber: 4 }]);
    expect(h.events.filter(event => event.type === 'start')).toHaveLength(1);
  });

  it('uploads a take saved during an in-flight session without a new connectivity event', async () => {
    const h = createHarness({
      workerDelayMs: 30,
      chapters: [{ bookId: 1, chapterNumber: 1 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'syncing');

    h.setChapters([
      { bookId: 1, chapterNumber: 1 },
      { bookId: 1, chapterNumber: 7 },
    ]);
    h.orchestrator.notifyPendingWork();

    await h.waitFor(() =>
      h.uploaded.some(chapter => chapter.chapterNumber === 7),
    );
    expect(
      h.events.filter(event => event.type === 'start').length,
    ).toBeGreaterThan(1);
  });

  it('does not upload a saved take while the pause window is active', async () => {
    const h = createHarness({ chapters: [] });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.orchestrator.pause();

    h.setChapters([{ bookId: 6, chapterNumber: 1 }]);
    h.orchestrator.notifyPendingWork();
    await h.flush();

    expect(h.uploaded).toEqual([]);
    expect(h.orchestrator.getSnapshot().phase).toBe('paused');
  });

  it('resumes auto-upload when the pause window ends without a connectivity change', async () => {
    const h = createHarness();
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    h.setChapters([{ bookId: 5, chapterNumber: 1 }]);
    await h.orchestrator.pause();

    expect(
      h.pendingTimers().some(timer => timer.delayMs === PAUSE_WINDOW_MS),
    ).toBe(true);
    expect(h.uploaded.some(chapter => chapter.bookId === 5)).toBe(false);

    h.setNow(1_000_000 + PAUSE_WINDOW_MS);
    h.fireTimer(PAUSE_WINDOW_MS);
    await h.flush();
    await h.flush();

    expect(h.getPausedUntilMs()).toBeNull();
    expect(h.uploaded.some(chapter => chapter.bookId === 5)).toBe(true);
  });

  it('clears an expired pause while offline instead of staying paused', async () => {
    const h = createHarness({ chapters: [] });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.orchestrator.pause();
    h.setChapters([{ bookId: 5, chapterNumber: 1 }]);
    h.emitConnectivity(false, false);
    await h.flush();

    expect(h.orchestrator.getSnapshot().phase).toBe('paused');

    h.setNow(1_000_000 + PAUSE_WINDOW_MS);
    h.fireTimer(PAUSE_WINDOW_MS);
    await h.flush();

    expect(h.getPausedUntilMs()).toBeNull();
    expect(h.orchestrator.getSnapshot().phase).toBe('offline');
    expect(h.uploaded).toEqual([]);
  });

  it('schedules an automatic retry after a failed session using the #150 delay', async () => {
    let fail = true;
    const h = createHarness({
      failUploads: () => fail,
    });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([]);
    expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([
      sessionRetryDelayMs(1),
    ]);

    fail = false;
    h.fireTimer(sessionRetryDelayMs(1));
    await h.flush();
    await h.flush();

    expect(h.uploaded).toHaveLength(2);
    expect(h.events.some(event => event.type === 'complete')).toBe(true);
  });

  it('stops scheduling retries after the default attempt budget', async () => {
    const h = createHarness({ failUploads: () => true });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    for (let attempt = 1; attempt < SESSION_RETRY_MAX_ATTEMPTS; attempt += 1) {
      expect(h.pendingTimers().map(timer => timer.delayMs)).toContain(
        sessionRetryDelayMs(attempt),
      );
      h.fireTimer(sessionRetryDelayMs(attempt));
      await h.flush();
      await h.flush();
    }

    expect(h.pendingTimers()).toEqual([]);
    expect(h.uploaded).toEqual([]);
  });

  it('uploads a take saved during the last failed attempt without a connectivity event', async () => {
    let calls = 0;
    let harness: ReturnType<typeof createHarness> | null = null;
    const h = createHarness({
      chapters: [{ bookId: 1, chapterNumber: 1 }],
      failUploads: () => {
        calls += 1;
        if (calls === SESSION_RETRY_MAX_ATTEMPTS && harness) {
          harness.setChapters([
            { bookId: 1, chapterNumber: 1 },
            { bookId: 9, chapterNumber: 2 },
          ]);
          harness.orchestrator.notifyPendingWork();
        }
        return calls <= SESSION_RETRY_MAX_ATTEMPTS;
      },
    });
    harness = h;

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    for (let attempt = 1; attempt < SESSION_RETRY_MAX_ATTEMPTS; attempt += 1) {
      h.fireTimer(sessionRetryDelayMs(attempt));
      await h.flush();
      await h.flush();
    }

    expect(h.pendingTimers()).toEqual([]);
    expect(h.uploaded.some(chapter => chapter.chapterNumber === 2)).toBe(true);
  });

  it('preserves failed queued chapters across offline notification bursts and drains once on reconnect', async () => {
    let fail = true;
    const pending = [
      { bookId: 1, chapterNumber: 1 },
      { bookId: 1, chapterNumber: 2 },
      { bookId: 9, chapterNumber: 3 },
    ];
    const h = createHarness({ failUploads: () => fail });
    try {
      h.emitConnectivity(true, true);
      await h.flush();
      expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([
        sessionRetryDelayMs(1),
      ]);

      h.emitConnectivity(false, false);
      h.setChapters(pending);
      fail = false;
      for (let index = 0; index < 5; index += 1) {
        h.orchestrator.notifyPendingWork();
      }
      await h.flush();
      expect(h.pendingTimers()).toEqual([]);
      expect(h.uploaded).toEqual([]);
      expect(h.orchestrator.getSnapshot().phase).toBe('offline');

      h.emitConnectivity(true, true);
      h.emitConnectivity(true, true);
      h.orchestrator.notifyPendingWork();
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual(pending);
      expect(h.events.filter(event => event.type === 'complete')).toHaveLength(
        1,
      );
      expect(h.orchestrator.getSnapshot()).toMatchObject({
        phase: 'idle',
        completedChapters: 0,
        totalChapters: 0,
      });
      expect(h.pendingTimers()).toEqual([]);
    } finally {
      h.orchestrator.stop();
    }
  });

  it('keeps uploads paused when a pre-upload claim push resolves after the user pauses', async () => {
    let finishClaims!: () => void;
    const claims = new Promise<void>(resolve => {
      finishClaims = resolve;
    });
    const h = createHarness({ pushPendingClaimsBeforeUpload: () => claims });
    try {
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'start'));
      await h.orchestrator.pause();
      finishClaims();
      h.orchestrator.notifyPendingWork();
      await h.flush();
      expect(h.uploaded).toEqual([]);
      expect(h.orchestrator.getSnapshot()).toMatchObject({
        phase: 'paused',
        completedChapters: 0,
        totalChapters: 2,
      });
      expect(h.getPausedUntilMs()).toBe(1_000_000 + PAUSE_WINDOW_MS);

      await h.orchestrator.syncNow();
      expect(h.uploaded).toEqual([
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
      ]);
      expect(h.events.filter(event => event.type === 'complete')).toHaveLength(
        1,
      );
      expect(h.getPausedUntilMs()).toBeNull();
      expect(h.pendingTimers()).toEqual([]);
    } finally {
      finishClaims();
      h.orchestrator.stop();
    }
  });

  it('does not upload from an old session when a transport probe resolves after stop', async () => {
    let finishProbe!: (value: {
      isOnline: boolean;
      isWifi: boolean;
      connectionType: string;
    }) => void;
    const probe = new Promise<{
      isOnline: boolean;
      isWifi: boolean;
      connectionType: string;
    }>(resolve => {
      finishProbe = resolve;
    });
    const getSessionTransportSnapshot = jest.fn(() => probe);
    const h = createHarness({ getSessionTransportSnapshot });
    try {
      h.emitConnectivity(true, true);
      await h.waitFor(
        () => getSessionTransportSnapshot.mock.calls.length === 1,
      );
      h.orchestrator.stop();
      finishProbe({ isOnline: true, isWifi: true, connectionType: 'wifi' });
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([]);
      expect(h.events.some(event => event.type === 'start')).toBe(false);
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
      expect(h.orchestrator.getSnapshot().phase).toBe('idle');
      expect(h.pendingTimers()).toEqual([]);
    } finally {
      h.orchestrator.stop();
    }
  });

  it('does not start a worker when a pending-queue read resolves after stop', async () => {
    let finishRead!: (chapters: PendingUploadChapter[]) => void;
    const read = new Promise<PendingUploadChapter[]>(resolve => {
      finishRead = resolve;
    });
    const getPendingUploadChapters = jest.fn(() => read);
    const h = createHarness({ getPendingUploadChapters });
    try {
      h.emitConnectivity(true, true);
      await h.waitFor(() => getPendingUploadChapters.mock.calls.length === 1);
      h.orchestrator.stop();
      finishRead([{ bookId: 1, chapterNumber: 1 }]);
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([]);
      expect(h.events.some(event => event.type === 'start')).toBe(false);
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
      expect(h.orchestrator.getSnapshot().phase).toBe('idle');
      expect(h.pendingTimers()).toEqual([]);
    } finally {
      h.orchestrator.stop();
    }
  });

  it('lets a restarted lifecycle finish fresh work before an old transport probe settles', async () => {
    type Transport = {
      isOnline: boolean;
      isWifi: boolean;
      connectionType: string;
    };
    let finishOldProbe!: (value: Transport) => void;
    const oldProbe = new Promise<Transport>(resolve => {
      finishOldProbe = resolve;
    });
    const online = { isOnline: true, isWifi: true, connectionType: 'wifi' };
    const getSessionTransportSnapshot = jest
      .fn<Promise<Transport>, []>()
      .mockImplementationOnce(() => oldProbe)
      .mockResolvedValue(online);
    const firstFresh = { bookId: 9, chapterNumber: 1 };
    const secondFresh = { bookId: 9, chapterNumber: 2 };
    const h = createHarness({
      chapters: [firstFresh],
      getSessionTransportSnapshot,
    });
    try {
      h.emitConnectivity(true, true);
      await h.waitFor(
        () => getSessionTransportSnapshot.mock.calls.length === 1,
      );
      h.orchestrator.stop();
      h.orchestrator.start();
      h.emitConnectivity(true, true);
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([firstFresh]);

      finishOldProbe({
        isOnline: false,
        isWifi: false,
        connectionType: 'none',
      });
      await h.flush();
      h.setChapters([secondFresh]);
      h.orchestrator.notifyPendingWork();
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([firstFresh, secondFresh]);
      expect(h.events.filter(event => event.type === 'complete')).toHaveLength(
        2,
      );
      expect(h.orchestrator.getSnapshot().phase).toBe('idle');
      expect(h.pendingTimers()).toEqual([]);
    } finally {
      finishOldProbe(online);
      h.orchestrator.stop();
      await h.flush();
    }
  });

  it('lets a restarted lifecycle drain fresh work without waiting for an old pending-queue read', async () => {
    let finishOldRead!: (chapters: PendingUploadChapter[]) => void;
    const oldRead = new Promise<PendingUploadChapter[]>(resolve => {
      finishOldRead = resolve;
    });
    const fresh = { bookId: 9, chapterNumber: 3 };
    let calls = 0;
    const getPendingUploadChapters = jest.fn(
      async (): Promise<PendingUploadChapter[]> => {
        calls += 1;
        if (calls === 1) return oldRead;
        return h.uploaded.length === 0 ? [fresh] : [];
      },
    );
    const h: ReturnType<typeof createHarness> = createHarness({
      chapters: [fresh],
      getPendingUploadChapters,
    });
    try {
      h.emitConnectivity(true, true);
      await h.waitFor(() => getPendingUploadChapters.mock.calls.length === 1);
      h.orchestrator.stop();
      h.orchestrator.start();
      h.emitConnectivity(true, true);
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([fresh]);
      const completedEvents = [...h.events];

      finishOldRead([{ bookId: 1, chapterNumber: 99 }]);
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([fresh]);
      expect(h.events).toEqual(completedEvents);
      expect(h.events.filter(event => event.type === 'complete')).toHaveLength(
        1,
      );
      expect(h.orchestrator.getSnapshot()).toMatchObject({
        phase: 'idle',
        completedChapters: 0,
        totalChapters: 0,
      });
      expect(h.pendingTimers()).toEqual([]);
    } finally {
      finishOldRead([]);
      h.orchestrator.stop();
      await h.flush();
    }
  });

  it('does not let an old preflight finalizer unlock a restarted lifecycle still probing', async () => {
    type Transport = {
      isOnline: boolean;
      isWifi: boolean;
      connectionType: string;
    };
    let finishOld!: (value: Transport) => void;
    let finishFresh!: (value: Transport) => void;
    const old = new Promise<Transport>(resolve => {
      finishOld = resolve;
    });
    const fresh = new Promise<Transport>(resolve => {
      finishFresh = resolve;
    });
    const online = { isOnline: true, isWifi: true, connectionType: 'wifi' };
    const getSessionTransportSnapshot = jest
      .fn<Promise<Transport>, []>()
      .mockImplementationOnce(() => old)
      .mockImplementationOnce(() => fresh)
      .mockResolvedValue(online);
    const chapter = { bookId: 9, chapterNumber: 4 };
    const h = createHarness({
      chapters: [chapter],
      getSessionTransportSnapshot,
    });
    try {
      h.emitConnectivity(true, true);
      await h.waitFor(
        () => getSessionTransportSnapshot.mock.calls.length === 1,
      );
      h.orchestrator.stop();
      h.orchestrator.start();
      h.emitConnectivity(true, true);
      await h.flush();
      expect(getSessionTransportSnapshot).toHaveBeenCalledTimes(2);

      finishOld(online);
      await h.flush();
      h.orchestrator.notifyPendingWork();
      h.emitConnectivity(true, true);
      await h.flush();
      expect(getSessionTransportSnapshot).toHaveBeenCalledTimes(2);
      expect(h.uploaded).toEqual([]);
      expect(h.events.some(event => event.type === 'start')).toBe(false);

      finishFresh(online);
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([chapter]);
      expect(h.events.filter(event => event.type === 'start')).toHaveLength(1);
      expect(h.events.filter(event => event.type === 'complete')).toHaveLength(
        1,
      );
      expect(h.pendingTimers()).toEqual([]);
    } finally {
      finishOld(online);
      finishFresh(online);
      h.orchestrator.stop();
      await h.flush();
    }
  });

  it('ignores an old post-upload queue read instead of publishing progress into a restarted session', async () => {
    const oldChapter = { bookId: 1, chapterNumber: 1 };
    const freshChapters = [
      { bookId: 9, chapterNumber: 2 },
      { bookId: 9, chapterNumber: 3 },
    ];
    let finishOldRead!: (chapters: PendingUploadChapter[]) => void;
    const oldRead = new Promise<PendingUploadChapter[]>(resolve => {
      finishOldRead = resolve;
    });
    const getPendingUploadChapters = jest
      .fn<Promise<PendingUploadChapter[]>, []>()
      // Pre-probe check, post-probe read, then the post-upload read.
      .mockResolvedValueOnce([oldChapter])
      .mockResolvedValueOnce([oldChapter])
      .mockImplementationOnce(() => oldRead)
      .mockResolvedValue(freshChapters);
    const h = createHarness({
      chapters: [oldChapter],
      getPendingUploadChapters,
      holdChapterNumber: 2,
    });
    try {
      h.emitConnectivity(true, true);
      await h.waitFor(() => getPendingUploadChapters.mock.calls.length === 3);
      h.orchestrator.stop();
      h.orchestrator.start();
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.uploaded.length === 2);
      expect(h.orchestrator.getSnapshot()).toMatchObject({
        phase: 'syncing',
        completedChapters: 0,
        totalChapters: 2,
      });
      const freshEvents = [...h.events];

      finishOldRead([]);
      await h.flush();
      await h.flush();
      expect(h.orchestrator.getSnapshot()).toMatchObject({
        phase: 'syncing',
        completedChapters: 0,
        totalChapters: 2,
      });
      expect(h.events).toEqual(freshEvents);
      expect(h.uploaded).toEqual([oldChapter, freshChapters[0]]);
    } finally {
      finishOldRead([]);
      h.orchestrator.stop();
      await h.flush();
    }
  });
  it.each(['pause', 'cancel', 'offline'] as const)(
    'honors %s while the initial pending-queue read is unresolved, then drains once after recovery',
    async control => {
      const pending = [
        { bookId: 1, chapterNumber: 1 },
        { bookId: 1, chapterNumber: 2 },
      ];
      let finishRead!: (chapters: PendingUploadChapter[]) => void;
      const read = new Promise<PendingUploadChapter[]>(resolve => {
        finishRead = resolve;
      });
      let calls = 0;
      const getPendingUploadChapters = jest.fn(
        async (): Promise<PendingUploadChapter[]> => {
          calls += 1;
          if (calls === 1) return read;
          return pending.filter(
            chapter =>
              !h.uploaded.some(
                uploaded =>
                  uploaded.bookId === chapter.bookId &&
                  uploaded.chapterNumber === chapter.chapterNumber,
              ),
          );
        },
      );
      const h: ReturnType<typeof createHarness> = createHarness({
        getPendingUploadChapters,
      });
      try {
        h.emitConnectivity(true, true);
        await h.waitFor(() => getPendingUploadChapters.mock.calls.length === 1);
        if (control === 'pause') await h.orchestrator.pause();
        else if (control === 'cancel') await h.orchestrator.cancel();
        else h.emitConnectivity(false, false);
        await h.flush();

        finishRead(pending);
        await h.flush();
        await h.flush();
        expect(h.uploaded).toEqual([]);
        expect(h.events.some(event => event.type === 'start')).toBe(false);
        expect(h.orchestrator.getSnapshot().phase).toBe(
          control === 'pause'
            ? 'paused'
            : control === 'offline'
            ? 'offline'
            : 'idle',
        );

        if (control === 'pause') {
          expect(h.getPausedUntilMs()).toBe(1_000_000 + PAUSE_WINDOW_MS);
          await h.orchestrator.syncNow();
        } else {
          if (control === 'cancel') {
            h.emitConnectivity(true, true);
            h.orchestrator.notifyPendingWork();
            await h.flush();
            expect(h.uploaded).toEqual([]);
            h.emitConnectivity(false, false);
            await h.flush();
          }
          h.emitConnectivity(true, true);
          await h.flush();
          await h.flush();
        }
        expect(h.uploaded).toEqual(pending);
        expect(
          h.events.filter(event => event.type === 'complete'),
        ).toHaveLength(1);
        expect(h.pendingTimers()).toEqual([]);
        expect(h.orchestrator.getSnapshot()).toMatchObject({
          phase: 'idle',
          completedChapters: 0,
          totalChapters: 0,
        });
      } finally {
        finishRead([]);
        h.orchestrator.stop();
        await h.flush();
      }
    },
  );

  it('does not auto-upload while the drafting screen holds uploads', async () => {
    const h = createHarness({ chapters: [] });
    await h.orchestrator.setDraftingHold(true);
    h.emitConnectivity(true, true);
    await h.flush();

    h.setChapters([{ bookId: 8, chapterNumber: 4 }]);
    h.orchestrator.notifyPendingWork();
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([]);
    expect(h.events.some(event => event.type === 'start')).toBe(false);
  });

  it('lets an in-flight upload finish when the drafting hold turns on', async () => {
    const h = createHarness({
      workerDelayMs: 40,
      chapters: [{ bookId: 1, chapterNumber: 1 }],
    });
    h.emitConnectivity(true, true);
    await h.waitFor(() => h.orchestrator.getSnapshot().phase === 'syncing');

    await h.orchestrator.setDraftingHold(true);
    await h.flush();
    await h.flush();

    expect(h.orchestrator.getSnapshot().phase).toBe('syncing');
    await h.waitFor(() => h.uploaded.length === 1);
    expect(h.uploaded).toEqual([{ bookId: 1, chapterNumber: 1 }]);
  });

  it('starts the pending upload when the drafting hold lifts', async () => {
    const h = createHarness({
      chapters: [{ bookId: 3, chapterNumber: 2 }],
    });
    await h.orchestrator.setDraftingHold(true);
    h.emitConnectivity(true, true);
    await h.flush();
    expect(h.uploaded).toEqual([]);

    await h.orchestrator.setDraftingHold(false);
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([{ bookId: 3, chapterNumber: 2 }]);
  });

  it('still uploads when syncNow runs during the drafting hold', async () => {
    const h = createHarness({
      chapters: [{ bookId: 4, chapterNumber: 1 }],
    });
    await h.orchestrator.setDraftingHold(true);
    h.emitConnectivity(true, true);
    await h.flush();

    await h.orchestrator.syncNow();

    expect(h.uploaded).toEqual([{ bookId: 4, chapterNumber: 1 }]);
  });

  it('keeps the hold when created with initialDraftingHold', async () => {
    const h = createHarness({
      chapters: [{ bookId: 8, chapterNumber: 1 }],
      initialDraftingHold: true,
    });
    h.emitConnectivity(true, true);
    await h.flush();
    h.orchestrator.notifyPendingWork();
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([]);
    expect(h.events.some(event => event.type === 'start')).toBe(false);
  });

  it('keeps a 24h pause after the drafting hold lifts', async () => {
    const h = createHarness({ chapters: [] });
    h.emitConnectivity(true, true);
    await h.flush();
    await h.orchestrator.pause();
    h.setChapters([{ bookId: 5, chapterNumber: 1 }]);

    await h.orchestrator.setDraftingHold(true);
    await h.orchestrator.setDraftingHold(false);
    await h.flush();
    await h.flush();

    expect(h.getPausedUntilMs()).not.toBeNull();
    expect(h.orchestrator.getSnapshot().phase).toBe('paused');
    expect(h.uploaded).toEqual([]);
  });
  describe('truthful progress (#886)', () => {
    it('emits per-take progress inside the current chapter and drops it at the chapter boundary', async () => {
      const h = createHarness({
        chapters: [{ bookId: 1, chapterNumber: 5 }],
        takesPerChapter: { total: 3 },
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'complete'));

      const progress = h.events.filter(
        (event): event is Extract<UploadSessionEvent, { type: 'progress' }> =>
          event.type === 'progress',
      );
      expect(
        progress.map(event => event.currentChapter?.completedTakes),
      ).toEqual([0, 1, 2, 3, undefined]);
      expect(progress[1]).toEqual({
        type: 'progress',
        completedChapters: 0,
        totalChapters: 1,
        currentChapter: {
          bookId: 1,
          chapterNumber: 5,
          completedTakes: 1,
          failedTakes: 0,
          totalTakes: 3,
        },
      });
      // Boundary event carries the chapter count and no per-take detail.
      expect(progress[4]).toEqual({
        type: 'progress',
        completedChapters: 1,
        totalChapters: 1,
      });
      expect(h.orchestrator.getSnapshot().currentChapter).toBeNull();
    });

    it('exposes the current chapter in the snapshot while a chapter is mid-upload', async () => {
      const h = createHarness({
        chapters: [{ bookId: 2, chapterNumber: 1 }],
        takesPerChapter: { total: 4, delayMs: 30 },
      });
      h.emitConnectivity(true, true);
      await h.waitFor(
        () => h.orchestrator.getSnapshot().currentChapter?.completedTakes === 2,
      );

      expect(h.orchestrator.getSnapshot()).toMatchObject({
        phase: 'syncing',
        completedChapters: 0,
        totalChapters: 1,
        currentChapter: {
          bookId: 2,
          chapterNumber: 1,
          completedTakes: 2,
          failedTakes: 0,
          totalTakes: 4,
        },
      });
    });

    it('counts failed takes separately and clears the current chapter when the chapter pass fails', async () => {
      const h = createHarness({
        chapters: [{ bookId: 1, chapterNumber: 1 }],
        takesPerChapter: { total: 2, failed: 1 },
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'idle'));

      const last = [...h.events]
        .reverse()
        .find(
          (event): event is Extract<UploadSessionEvent, { type: 'progress' }> =>
            event.type === 'progress',
        );
      expect(last?.currentChapter).toMatchObject({
        completedTakes: 1,
        failedTakes: 1,
        totalTakes: 2,
      });
      expect(h.orchestrator.getSnapshot().currentChapter).toBeNull();
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
    });

    it('emits hold events and exposes holdReason while automatic uploads are held', async () => {
      const h = createHarness({ chapters: [{ bookId: 8, chapterNumber: 4 }] });
      h.emitConnectivity(false, false);
      await h.flush();
      h.events.length = 0;

      await h.orchestrator.setDraftingHold(true);
      expect(h.events).toEqual([
        { type: 'hold', held: true, reason: 'drafting' },
      ]);
      expect(h.orchestrator.getSnapshot().holdReason).toBe('drafting');

      // Re-asserting the same hold is not a new event.
      await h.orchestrator.setDraftingHold(true);
      expect(h.events).toHaveLength(1);

      await h.orchestrator.setDraftingHold(false);
      await h.flush();
      expect(h.events[1]).toEqual({
        type: 'hold',
        held: false,
        reason: 'drafting',
      });
      expect(h.orchestrator.getSnapshot().holdReason).toBeNull();
    });

    it('ignores take progress reported after the session was paused', async () => {
      let listener: TakeProgressListener | undefined;
      const h = createHarness({
        chapters: [{ bookId: 3, chapterNumber: 2 }],
        holdChapterNumber: 2,
        captureTakeProgress: captured => {
          listener = captured;
        },
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => listener !== undefined);

      await h.orchestrator.pause();
      await h.flush();
      const eventCount = h.events.length;

      listener!({ completedTakes: 1, failedTakes: 0, totalTakes: 5 });
      await h.flush();

      expect(h.events).toHaveLength(eventCount);
      expect(h.orchestrator.getSnapshot().currentChapter).toBeNull();
      expect(h.orchestrator.getSnapshot().phase).toBe('paused');
    });

    it('records the hold without emitting while stopped, so a restart does not replay it', async () => {
      const h = createHarness({ chapters: [{ bookId: 8, chapterNumber: 4 }] });
      h.emitConnectivity(false, false);
      await h.flush();
      h.orchestrator.stop();
      h.events.length = 0;

      await h.orchestrator.setDraftingHold(true);

      expect(h.events).toEqual([]);
      expect(h.orchestrator.getSnapshot().holdReason).toBe('drafting');
    });

    it('fails a drain-only session when the claim push soft-fails so the bounded retry runs', async () => {
      const pushClaims = jest
        .fn()
        .mockRejectedValueOnce(new Error('claim push left 1 claim(s) pending'))
        .mockResolvedValue(undefined);
      const h = createHarness({
        chapters: [],
        hasPendingClaims: async () => true,
        pushPendingClaimsBeforeUpload: pushClaims,
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.pendingTimers().length === 1);

      expect(h.events.some(event => event.type === 'complete')).toBe(false);
      expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([
        sessionRetryDelayMs(1),
      ]);

      h.fireTimer(sessionRetryDelayMs(1));
      await h.waitFor(() => h.events.some(event => event.type === 'complete'));
      expect(pushClaims).toHaveBeenCalledTimes(2);
    });

    it('runs a claim-only session on reconnect so queued claims do not wait for another trigger', async () => {
      const pushClaims = jest.fn().mockResolvedValue(undefined);
      const h = createHarness({
        chapters: [],
        hasPendingClaims: async () => true,
        pushPendingClaimsBeforeUpload: pushClaims,
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'complete'));

      expect(pushClaims).toHaveBeenCalledTimes(1);
      expect(h.events.some(event => event.type === 'start')).toBe(false);
    });

    it('stays idle on reconnect when there are no chapters, stage rows or claims', async () => {
      const pushClaims = jest.fn().mockResolvedValue(undefined);
      const h = createHarness({
        chapters: [],
        hasPendingClaims: async () => false,
        pushPendingClaimsBeforeUpload: pushClaims,
      });
      h.emitConnectivity(true, true);
      await h.flush();
      await h.flush();

      expect(pushClaims).not.toHaveBeenCalled();
      expect(h.events).toEqual([{ type: 'idle' }]);
    });

    it('takes the connectivity-pause path when the claim push reports deferred (offline) work', async () => {
      const h = createHarness({
        chapters: [{ bookId: 1, chapterNumber: 1 }],
        pushPendingClaimsBeforeUpload: async () => {
          throw new UploadNetworkInterruptedError(
            'Chapter claim push deferred 1 claim(s): offline',
          );
        },
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'paused'));

      expect(h.events).toContainEqual({
        type: 'paused',
        reason: 'connectivity',
      });
      expect(h.uploaded).toEqual([]);
      expect(h.events.some(event => event.type === 'complete')).toBe(false);
      expect(h.orchestrator.getSnapshot().phase).toBe('offline');
    });

    it('still continues past a non-network claim push failure', async () => {
      const h = createHarness({
        chapters: [{ bookId: 1, chapterNumber: 1 }],
        pushPendingClaimsBeforeUpload: async () => {
          throw new Error('claim endpoint 500');
        },
      });
      h.emitConnectivity(true, true);
      await h.waitFor(() => h.events.some(event => event.type === 'complete'));

      expect(h.uploaded).toEqual([{ bookId: 1, chapterNumber: 1 }]);
    });
  });

  describe('automatic sessions with nothing queued (#886)', () => {
    const online = { isOnline: true, isWifi: true, connectionType: 'wifi' };

    it('returning from a held screen to an empty queue goes idle without a probe', async () => {
      const getSessionTransportSnapshot = jest.fn(async () => online);
      const getPendingUploadChapters = jest.fn(
        async (): Promise<PendingUploadChapter[]> => [],
      );
      const h = createHarness({
        initialDraftingHold: true,
        getSessionTransportSnapshot,
        getPendingUploadChapters,
      });
      h.emitConnectivity(true, true, 'wifi');
      await h.flush();
      expect(getPendingUploadChapters).not.toHaveBeenCalled();

      await h.orchestrator.setDraftingHold(false);
      await h.waitFor(() => h.events.some(e => e.type === 'idle'));
      expect(getSessionTransportSnapshot).not.toHaveBeenCalled();
      expect(getPendingUploadChapters).toHaveBeenCalledTimes(1);
      expect(h.orchestrator.getSnapshot().phase).toBe('idle');
      h.orchestrator.stop();
    });

    it('queued work still gets a fresh probe before uploading', async () => {
      const getSessionTransportSnapshot = jest.fn(async () => online);
      const h = createHarness({
        initialDraftingHold: true,
        getSessionTransportSnapshot,
      });
      h.emitConnectivity(true, true, 'wifi');
      await h.flush();
      await h.orchestrator.setDraftingHold(false);
      await h.waitFor(() => h.events.some(e => e.type === 'complete'));
      expect(getSessionTransportSnapshot).toHaveBeenCalledTimes(1);
      expect(h.uploaded).toHaveLength(2);
      h.orchestrator.stop();
    });

    it('queued work is not uploaded when that fresh probe fails', async () => {
      const getSessionTransportSnapshot = jest.fn(async () => ({
        isOnline: false,
        isWifi: true,
        connectionType: 'wifi',
      }));
      const h = createHarness({ getSessionTransportSnapshot });
      h.emitConnectivity(true, true, 'wifi');
      await h.waitFor(() => getSessionTransportSnapshot.mock.calls.length > 0);
      await h.flush();
      expect(h.uploaded).toEqual([]);
      expect(h.orchestrator.getSnapshot().phase).toBe('offline');
      h.orchestrator.stop();
    });

    it('stage-only and claim-only work still probes and drains', async () => {
      for (const extra of ['stage', 'claim'] as const) {
        let stagePending = extra === 'stage';
        let claimPending = extra === 'claim';
        const pushPendingStageAdvancesAfterUpload = jest.fn(async () => {
          stagePending = false;
        });
        const pushPendingClaimsBeforeUpload = jest.fn(async () => {
          claimPending = false;
        });
        const getSessionTransportSnapshot = jest.fn(async () => online);
        const h = createHarness({
          chapters: [],
          getSessionTransportSnapshot,
          hasPendingStageAdvances: async () => stagePending,
          hasPendingClaims: async () => claimPending,
          pushPendingStageAdvancesAfterUpload,
          pushPendingClaimsBeforeUpload,
        });
        h.emitConnectivity(true, true, 'wifi');
        await h.waitFor(() => h.events.some(e => e.type === 'complete'));
        expect(getSessionTransportSnapshot).toHaveBeenCalledTimes(1);
        expect(
          extra === 'stage'
            ? pushPendingStageAdvancesAfterUpload
            : pushPendingClaimsBeforeUpload,
        ).toHaveBeenCalled();
        expect(stagePending || claimPending).toBe(false);
        h.orchestrator.stop();
      }
    });

    it('counts queue reads and probes per session (empty auto skips the probe; queued auto reads twice)', async () => {
      const run = async (
        chapters: PendingUploadChapter[],
        trigger: 'auto' | 'sync_now',
      ) => {
        const getSessionTransportSnapshot = jest.fn(async () => online);
        const hasPendingStageAdvances = jest.fn(async () => false);
        const hasPendingClaims = jest.fn(async () => false);
        const h = createHarness({
          chapters,
          getSessionTransportSnapshot,
          hasPendingStageAdvances,
          hasPendingClaims,
        });
        if (trigger === 'auto') {
          h.emitConnectivity(true, true, 'wifi');
        } else {
          await h.orchestrator.syncNow();
        }
        await h.waitFor(() =>
          h.events.some(e => e.type === 'idle' || e.type === 'complete'),
        );
        h.orchestrator.stop();
        return {
          probes: getSessionTransportSnapshot.mock.calls.length,
          stageReads: hasPendingStageAdvances.mock.calls.length,
          claimReads: hasPendingClaims.mock.calls.length,
        };
      };
      const one = [{ bookId: 1, chapterNumber: 1 }];
      await expect(run([], 'auto')).resolves.toEqual({
        probes: 0,
        stageReads: 1,
        claimReads: 1,
      });
      await expect(run(one, 'auto')).resolves.toEqual({
        probes: 1,
        stageReads: 2,
        claimReads: 2,
      });
      await expect(run([], 'sync_now')).resolves.toEqual({
        probes: 1,
        stageReads: 1,
        claimReads: 1,
      });
      await expect(run(one, 'sync_now')).resolves.toEqual({
        probes: 1,
        stageReads: 1,
        claimReads: 1,
      });
    });

    it('a take saved during the empty-queue check is uploaded right after', async () => {
      let finishCheck!: (chapters: PendingUploadChapter[]) => void;
      const check = new Promise<PendingUploadChapter[]>(resolve => {
        finishCheck = resolve;
      });
      const saved = { bookId: 4, chapterNumber: 7 };
      let reads = 0;
      const getPendingUploadChapters = jest.fn(
        async (): Promise<PendingUploadChapter[]> => {
          reads += 1;
          if (reads === 1) return check;
          return h.uploaded.length === 0 ? [saved] : [];
        },
      );
      const getSessionTransportSnapshot = jest.fn(async () => online);
      const h: ReturnType<typeof createHarness> = createHarness({
        getPendingUploadChapters,
        getSessionTransportSnapshot,
      });
      h.emitConnectivity(true, true, 'wifi');
      await h.waitFor(() => reads === 1);
      h.orchestrator.notifyPendingWork();
      finishCheck([]);
      await h.waitFor(() => h.events.some(e => e.type === 'complete'));
      expect(h.uploaded).toEqual([saved]);
      expect(getSessionTransportSnapshot).toHaveBeenCalledTimes(1);
      h.orchestrator.stop();
    });

    it('Sync Now with an empty queue still probes', async () => {
      const getSessionTransportSnapshot = jest.fn(async () => online);
      const h = createHarness({ chapters: [], getSessionTransportSnapshot });
      await h.orchestrator.syncNow();
      expect(getSessionTransportSnapshot).toHaveBeenCalledTimes(1);
      h.orchestrator.stop();
    });

    it('after Cancel, an empty-queue trigger stays silent as before', async () => {
      const h = createHarness({ chapters: [] });
      h.emitConnectivity(true, true, 'wifi');
      await h.waitFor(() => h.events.some(e => e.type === 'idle'));
      await h.orchestrator.cancel();
      const before = h.events.length;
      h.orchestrator.notifyPendingWork();
      await h.flush();
      expect(h.events.slice(before)).toEqual([]);
      h.orchestrator.stop();
    });
  });

  describe('reusing a confirmed empty queue (#886)', () => {
    const marks = () => {
      let changes = 0;
      const getQueueWriteMark = jest.fn(
        async (): Promise<object | null> => ({ changes }),
      );
      return {
        getQueueWriteMark,
        sameQueueWriteMark: (a: object, b: object) =>
          (a as { changes: number }).changes ===
          (b as { changes: number }).changes,
        write: () => {
          changes += 1;
        },
        /** Hold the next mark read until `release` runs. */
        holdNext: () => {
          let release!: () => void;
          const gate = new Promise<void>(resolve => {
            release = resolve;
          });
          getQueueWriteMark.mockImplementationOnce(async () => {
            await gate;
            return { changes };
          });
          return release;
        },
      };
    };

    const returnHome = async (h: ReturnType<typeof createHarness>) => {
      await h.orchestrator.setDraftingHold(true);
      await h.orchestrator.setDraftingHold(false);
      await h.flush();
      await h.flush();
    };

    it('a pause, hold or stop landing during the mark read is honoured', async () => {
      for (const interrupt of ['pause', 'hold', 'stop'] as const) {
        const m = marks();
        const getPendingUploadChapters = jest.fn(
          async (): Promise<PendingUploadChapter[]> => [],
        );
        const h = createHarness({
          getPendingUploadChapters,
          getQueueWriteMark: m.getQueueWriteMark,
          sameQueueWriteMark: m.sameQueueWriteMark,
        });
        h.emitConnectivity(true, true, 'wifi');
        await h.waitFor(() => h.events.some(e => e.type === 'idle'));
        const release = m.holdNext();
        h.orchestrator.notifyPendingWork();
        await h.flush();
        if (interrupt === 'pause') await h.orchestrator.pause();
        if (interrupt === 'hold') await h.orchestrator.setDraftingHold(true);
        if (interrupt === 'stop') h.orchestrator.stop();
        const idles = h.events.filter(e => e.type === 'idle').length;
        release();
        await h.flush();
        await h.flush();
        expect(h.events.filter(e => e.type === 'idle').length).toBe(idles);
        h.orchestrator.stop();
      }
    });

    it('reuses the empty answer until the write mark moves', async () => {
      const m = marks();
      const getPendingUploadChapters = jest.fn(
        async (): Promise<PendingUploadChapter[]> => [],
      );
      const h = createHarness({
        getPendingUploadChapters,
        getQueueWriteMark: m.getQueueWriteMark,
        sameQueueWriteMark: m.sameQueueWriteMark,
      });
      h.emitConnectivity(true, true, 'wifi');
      await h.waitFor(() => getPendingUploadChapters.mock.calls.length === 1);
      await returnHome(h);
      expect(getPendingUploadChapters).toHaveBeenCalledTimes(1);

      m.write();
      await returnHome(h);
      expect(getPendingUploadChapters).toHaveBeenCalledTimes(2);
      h.orchestrator.stop();
    });
  });

  describe('reusing the reachability that started a session (#886)', () => {
    const online = { isOnline: true, isWifi: true, connectionType: 'wifi' };
    const allowRecentArgs = (mock: jest.Mock) =>
      mock.mock.calls.map(call => call[0]?.allowRecent);

    it('lets only the session an online publish starts reuse it; Sync Now probes', async () => {
      const getSessionTransportSnapshot = jest.fn(async () => online);
      const h = createHarness({ getSessionTransportSnapshot });
      h.emitConnectivity(true, true, 'wifi');
      await h.waitFor(() => h.events.some(e => e.type === 'complete'));
      expect(allowRecentArgs(getSessionTransportSnapshot)).toEqual([true]);

      h.setChapters([{ bookId: 2, chapterNumber: 1 }]);
      h.orchestrator.notifyPendingWork();
      await h.waitFor(() => h.uploaded.length === 3);
      await h.orchestrator.syncNow();
      expect(allowRecentArgs(getSessionTransportSnapshot)).toEqual([
        true,
        false,
        false,
      ]);

      h.setChapters([{ bookId: 3, chapterNumber: 1 }]);
      h.emitConnectivity(true, true, 'wifi');
      await h.flush();
      await h.flush();
      expect(allowRecentArgs(getSessionTransportSnapshot)).toEqual([
        true,
        false,
        false,
        true,
      ]);
      h.orchestrator.stop();
    });

    it('a failed session retries with a fresh probe', async () => {
      let fail = true;
      const getSessionTransportSnapshot = jest.fn(async () => online);
      const h = createHarness({
        failUploads: () => fail,
        getSessionTransportSnapshot,
      });
      h.emitConnectivity(true, true, 'wifi');
      await h.flush();
      await h.flush();
      expect(h.uploaded).toEqual([]);

      fail = false;
      h.fireTimer(sessionRetryDelayMs(1));
      await h.waitFor(() => h.events.some(e => e.type === 'complete'));
      expect(allowRecentArgs(getSessionTransportSnapshot)).toEqual([
        true,
        false,
      ]);
      h.orchestrator.stop();
    });

    it('a network interrupt rechecks with fresh probes', async () => {
      const getSessionTransportSnapshot = jest.fn(async () => online);
      const h = createHarness({
        networkInterruptOnChapter: 2,
        getSessionTransportSnapshot,
      });
      h.emitConnectivity(true, true, 'wifi');
      await h.waitFor(() =>
        h.events.some(e => e.type === 'paused' && e.reason === 'connectivity'),
      );
      h.fireTimer(sessionRetryDelayMs(1));
      await h.waitFor(() => h.events.some(e => e.type === 'complete'), 2000);
      const [first, ...rest] = allowRecentArgs(getSessionTransportSnapshot);
      expect(first).toBe(true);
      expect(rest.length).toBeGreaterThan(0);
      expect(rest.every(arg => arg === false)).toBe(true);
      h.orchestrator.stop();
    });
  });

  it('releases held takes before reading pending chapters (#855)', async () => {
    const reconcile = jest.fn();
    const h = createHarness({
      chapters: [],
      reconcileHeldBeforeUpload: async () => {
        reconcile();
        // Membership came back for a take that is still `held`: the release
        // must happen before the read, or this chapter is never queued.
        h.setChapters([{ bookId: 3, chapterNumber: 4 }]);
        return { held: 0, released: 1 };
      },
    });

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(h.uploaded).toEqual([{ bookId: 3, chapterNumber: 4 }]);
  });

  it('uploads other pending chapters when reconciliation newly holds takes (#855)', async () => {
    const h = createHarness({
      reconcileHeldBeforeUpload: async () => ({ held: 1, released: 0 }),
    });

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    // The held takes are excluded from the pending read, so the session must
    // not stall work queued for the remaining chapters.
    expect(h.uploaded).toEqual([
      { bookId: 1, chapterNumber: 1 },
      { bookId: 1, chapterNumber: 2 },
    ]);
    expect(h.events.some(e => e.type === 'start')).toBe(true);
  });

  it('schedules a backed-off retry when held reconciliation rejects (#855)', async () => {
    const h = createHarness({
      reconcileHeldBeforeUpload: async () => {
        throw new Error('database unavailable');
      },
    });

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([]);
    expect(h.events.some(e => e.type === 'start')).toBe(false);
    // Attempt 1 backs off to 500ms instead of re-entering at the 0ms delay of
    // attempt 0, which would spin on a persistent failure.
    expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([500]);
  });

  it('refreshes project membership before reconciling held takes (#848)', async () => {
    const calls: string[] = [];
    const h = createHarness({
      refreshMembershipBeforeUpload: async () => {
        calls.push('refresh');
      },
      reconcileHeldBeforeUpload: async () => {
        calls.push('reconcile');
        return { held: 0, released: 0 };
      },
    });

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    // Server truth first, then the cache-based reconcile, once per session.
    expect(calls).toEqual(['refresh', 'reconcile']);
    expect(h.uploaded).toHaveLength(2);
  });

  it('defers uploads when the membership refresh fails on a stale cache (#848)', async () => {
    const reconcile = jest.fn(async () => ({ held: 0, released: 0 }));
    const h = createHarness({
      refreshMembershipBeforeUpload: async () => {
        throw new Error('projects unavailable');
      },
      reconcileHeldBeforeUpload: reconcile,
    });

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    // No membership answer means the cache could still say "member" for a
    // project the account has left: nothing may upload.
    expect(h.uploaded).toEqual([]);
    expect(reconcile).not.toHaveBeenCalled();
    expect(h.events.some(e => e.type === 'start')).toBe(false);
    expect(h.pendingTimers().map(timer => timer.delayMs)).toEqual([500]);
  });

  it('uploads once a later membership refresh succeeds (#848)', async () => {
    let refreshAttempts = 0;
    const h = createHarness({
      refreshMembershipBeforeUpload: async () => {
        refreshAttempts += 1;
        if (refreshAttempts === 1) {
          throw new Error('projects unavailable');
        }
      },
      reconcileHeldBeforeUpload: async () => ({ held: 0, released: 0 }),
    });

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();
    expect(h.uploaded).toEqual([]);

    h.fireTimer(500);
    await h.flush();
    await h.flush();

    // The failed attempt left every take queued, so the retry uploads them
    // with no extra user step.
    expect(refreshAttempts).toBe(2);
    expect(h.uploaded).toHaveLength(2);
  });

  it('emits idle when only held takes remain after reconciliation (#855)', async () => {
    const h = createHarness({
      chapters: [],
      reconcileHeldBeforeUpload: async () => ({ held: 2, released: 0 }),
    });

    h.emitConnectivity(true, true);
    await h.flush();
    await h.flush();

    expect(h.uploaded).toEqual([]);
    expect(h.events.some(e => e.type === 'start')).toBe(false);
    // Nothing else is queued, so the empty-queue path emits `idle`, which the
    // Sync page uses to reload the held list (#855).
    expect(h.events.some(e => e.type === 'idle')).toBe(true);
    expect(h.orchestrator.getSnapshot().phase).toBe('idle');
  });
});
