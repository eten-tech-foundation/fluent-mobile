import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  type ChapterUploadWorker,
  type UploadOrchestratorDeps,
} from './uploadOrchestratorCore';
import type { UploadSessionEvent } from './syncEvents';
import { UploadNetworkInterruptedError } from '../utils/networkError';
import type { PendingUploadChapter } from '../db/queries';

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      info: function (): void {},
      error: function (): void {},
      warn: function (): void {},
    }),
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
  reconcileHeldBeforeUpload?: UploadOrchestratorDeps['reconcileHeldBeforeUpload'];
  drainPendingDeletions?: () => Promise<{ failed: number }>;
  initialDraftingHold?: boolean;
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
    uploadChapter: async (chapter, signal, _onTakeProgress) => {
      if (options?.failUploads?.()) {
        throw new Error('upload failed');
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
    drainPendingDeletions: options?.drainPendingDeletions,
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
    reconcileHeldBeforeUpload: options?.reconcileHeldBeforeUpload,
    hasPendingClaims: options?.hasPendingClaims,
  };

  const orchestrator = createUploadOrchestrator(deps, {
    initialDraftingHold: options?.initialDraftingHold,
  });
  orchestrator.start();

  return {
    orchestrator,
    events,
    uploaded,
    chapters: () => chapters,
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
});
