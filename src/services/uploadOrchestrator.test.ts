import {
  createUploadOrchestrator,
  PAUSE_WINDOW_MS,
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

type ConnListener = (isOnline: boolean, isWifi: boolean) => void;

function createHarness(options?: {
  chapters?: PendingUploadChapter[];
  uploadOverCellular?: boolean;
  workerDelayMs?: number;
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

  const worker: ChapterUploadWorker = {
    uploadChapter: async (chapter, signal) => {
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
    emitConnectivity: (isOnline: boolean, isWifi: boolean) => {
      connListener?.(isOnline, isWifi);
    },
    getPausedUntilMs: () => pausedUntilMs,
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
});
