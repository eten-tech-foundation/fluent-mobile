import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
  SESSION_RETRY_MAX_ATTEMPTS,
  sessionRetryDelayMs,
  type ChapterUploadWorker,
  type UploadOrchestratorDeps,
} from './uploadOrchestratorCore';
import type { UploadSessionEvent } from './syncEvents';
import type { PendingUploadChapter } from '../db/queries';

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
  failUploads?: () => boolean;
  getSessionTransportSnapshot?: UploadOrchestratorDeps['getSessionTransportSnapshot'];
  pushPendingClaimsBeforeUpload?: UploadOrchestratorDeps['pushPendingClaimsBeforeUpload'];
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

  const timers: ScheduledTimer[] = [];

  const worker: ChapterUploadWorker = {
    uploadChapter: async (chapter, signal) => {
      if (options?.failUploads?.()) {
        throw new Error('upload failed');
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
      uploaded.push(chapter);
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
    getPendingUploadChapters: async () => chapters,
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
  };

  const orchestrator = createUploadOrchestrator(deps);
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

    expect(h.uploaded.some(chapter => chapter.bookId === 5)).toBe(true);
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
});
