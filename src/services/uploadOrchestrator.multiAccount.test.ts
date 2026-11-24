// #854 / #847: two accounts worked one chapter offline on this device. A
// recorded and sent it to Peer Check, then B recorded on it. On reconnect the
// session must upload A's takes, then A's stage advance, then B's takes, then
// B's stage advance, in one session, without marking B's takes failed.
import {
  createUploadOrchestrator,
  MAX_SESSION_ROUNDS,
  PAUSE_WINDOW_MS,
  type ChapterUploadWorker,
  type StagePushOutcome,
  type UploadOrchestratorDeps,
} from './uploadOrchestratorCore';
import type { UploadSessionEvent } from './syncEvents';
import { ChapterUploadDeferredError } from '../utils/chapterDeferredError';

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

type ConnListener = (online: boolean, wifi: boolean) => void;

const chapter = { bookId: 19, chapterNumber: 3 };

function harness(
  worker: ChapterUploadWorker,
  pendingChapters: () => boolean,
  pushStages: () => Promise<StagePushOutcome>,
) {
  let listener: ConnListener | null = null;
  const events: UploadSessionEvent[] = [];
  const timers: number[] = [];
  const deps: UploadOrchestratorDeps = {
    subscribeToConnectivity: onChange => {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
    getUploadOverCellular: () => false,
    subscribeToUploadOverCellular: () => () => undefined,
    getPendingUploadChapters: async () => (pendingChapters() ? [chapter] : []),
    getPausedUntilMs: () => null,
    setPausedUntilMs: () => undefined,
    now: () => 1_000_000,
    pauseWindowMs: PAUSE_WINDOW_MS,
    worker,
    emit: event => {
      events.push(event);
    },
    schedule: (_callback, delayMs) => {
      timers.push(delayMs);
      return () => undefined;
    },
    pushPendingStageAdvancesAfterUpload: pushStages,
    hasPendingStageAdvances: async () => true,
  };
  const orchestrator = createUploadOrchestrator(deps);
  orchestrator.start();
  return {
    events,
    timers,
    connect: () => listener?.(true, true),
    stop: () => orchestrator.stop(),
  };
}

const settle = async () => {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
};

describe('upload session across accounts on one device (#854)', () => {
  it("uploads A's takes, A's advance, B's takes, then B's advance, and completes", async () => {
    const log: string[] = [];
    let aTakes = 7;
    let bTakes = 2;
    let aStage = true;
    let bStage = true;
    const worker: ChapterUploadWorker = {
      uploadChapter: async () => {
        if (aTakes > 0) {
          log.push(`A uploads ${aTakes} takes`);
          aTakes = 0;
        }
        if (bTakes > 0) {
          // B recorded after A's queued advance: deferred while it is pending.
          if (aStage) throw new ChapterUploadDeferredError('B waits for A');
          log.push(`B uploads ${bTakes} takes`);
          bTakes = 0;
        }
      },
    };
    const pushStages = async (): Promise<StagePushOutcome> => {
      let progressed = false;
      if (aStage && aTakes === 0) {
        log.push('A: draft → peer_check');
        aStage = false;
        progressed = true;
      }
      if (bStage && !aStage && bTakes === 0) {
        log.push('B: peer_check → community_review');
        bStage = false;
        progressed = true;
      }
      return { progressed, blocked: 0 };
    };
    const h = harness(worker, () => aTakes + bTakes > 0, pushStages);

    h.connect();
    await settle();

    expect(log).toEqual([
      'A uploads 7 takes',
      'A: draft → peer_check',
      'B uploads 2 takes',
      'B: peer_check → community_review',
    ]);
    expect(h.events.map(event => event.type)).toContain('complete');
    expect(h.timers).toEqual([]);
    h.stop();
  });

  it("keeps B's takes pending without completing while A must sign in", async () => {
    const worker: ChapterUploadWorker = {
      uploadChapter: async () => {
        throw new ChapterUploadDeferredError('B waits for A');
      },
    };
    const pushStages = jest.fn(
      async (): Promise<StagePushOutcome> => ({
        progressed: false,
        blocked: 1,
      }),
    );
    const h = harness(worker, () => true, pushStages);

    h.connect();
    await settle();

    expect(pushStages).toHaveBeenCalledTimes(1);
    expect(h.events.map(event => event.type)).not.toContain('complete');
    // Bounded retry, as for any other session that left work behind.
    expect(h.timers).toHaveLength(1);
    h.stop();
  });

  it('does not complete while a stage advance stays blocked, even with no takes left', async () => {
    const worker: ChapterUploadWorker = {
      uploadChapter: async () => undefined,
    };
    const h = harness(
      worker,
      () => false,
      async () => ({ progressed: false, blocked: 1 }),
    );

    h.connect();
    await settle();

    expect(h.events.map(event => event.type)).not.toContain('complete');
    h.stop();
  });

  it('stops after the round cap even if every round reports progress', async () => {
    const uploadChapter = jest.fn(async () => {
      throw new ChapterUploadDeferredError('still waiting');
    });
    const h = harness(
      { uploadChapter },
      () => true,
      async () => ({ progressed: true, blocked: 0 }),
    );

    h.connect();
    await settle();

    expect(uploadChapter).toHaveBeenCalledTimes(MAX_SESSION_ROUNDS);
    expect(h.events.map(event => event.type)).not.toContain('complete');
    h.stop();
  });
});
