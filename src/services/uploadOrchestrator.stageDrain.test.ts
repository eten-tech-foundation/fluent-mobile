// Production wiring (#257): `pushPendingStageAdvancesAfterUpload` must turn the
// drain's resolved `{ failed > 0 }` result into a session failure so the bounded
// retry runs and `complete` (which refreshes My Work) only follows a confirmed
// drain. The drain itself is mocked at its production result contract.
import type { UploadSessionEvent } from './syncEvents';
import {
  SESSION_RETRY_MAX_ATTEMPTS,
  sessionRetryDelayMs,
  startUploadOrchestrator,
  stopUploadOrchestrator,
} from './uploadOrchestrator';

type ConnectivityListener = (
  online: boolean,
  wifi: boolean,
  cellular?: boolean,
  type?: string,
) => void;
const mockListeners = new Set<ConnectivityListener>();
const mockDrain = jest.fn();
const mockGetPendingStageAdvances = jest.fn();
const mockEmit = jest.fn();

jest.mock('../db/queries', () => ({
  getPendingUploadChapters: async () => [],
}));
jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: () => mockGetPendingStageAdvances(),
}));
jest.mock('./connectivity', () => ({
  subscribeToConnectivity: (listener: ConnectivityListener) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
  getConnectivitySnapshot: async () => ({
    isOnline: true,
    isWifi: true,
    connectionType: 'wifi',
  }),
}));
jest.mock('./userPreferences', () => ({
  getUploadOverCellular: () => false,
  subscribeToPreference: () => () => undefined,
}));
jest.mock('./storage', () => ({
  getActiveUserId: () => '10',
  getSyncPausedUntilMs: () => null,
  setSyncPausedUntilMs: jest.fn(),
}));
jest.mock('./sync', () => ({
  syncPendingChapterClaimsForUser: async () => ({
    synced: 0,
    conflicts: 0,
    failed: 0,
  }),
  syncPendingStageAdvancesForUser: (...args: unknown[]) => mockDrain(...args),
}));
jest.mock('./keychain', () => ({
  getCredentials: async () => ({ token: 'token-10' }),
}));
jest.mock('./syncEvents', () => ({
  emitUploadSessionEvent: (event: UploadSessionEvent) => mockEmit(event),
  onSyncComplete: () => () => undefined,
}));
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const stubWorker = { uploadChapter: jest.fn().mockResolvedValue(undefined) };

type Timer = { callback: () => void; delay: number; cancelled: boolean };
let timers: Timer[] = [];
const schedule = (callback: () => void, delay: number) => {
  const timer: Timer = {
    // A fired timer is no longer armed.
    callback: () => {
      timer.cancelled = true;
      callback();
    },
    delay,
    cancelled: false,
  };
  timers.push(timer);
  return () => {
    timer.cancelled = true;
  };
};
const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  expect(condition()).toBe(true);
};
const settle = async (): Promise<void> => {
  // Let already-resolved promise chains finish before asserting absence.
  await new Promise<void>(resolve => setTimeout(resolve, 20));
};
const armedTimers = () => timers.filter(timer => !timer.cancelled);
const connect = () => {
  for (const listener of [...mockListeners]) {
    listener(true, true, false, 'wifi');
  }
};
const eventTypes = () =>
  mockEmit.mock.calls.map(([event]) => (event as UploadSessionEvent).type);

beforeEach(() => {
  stopUploadOrchestrator();
  jest.clearAllMocks();
  mockListeners.clear();
  timers = [];
  mockGetPendingStageAdvances.mockResolvedValue([{ id: 1, userId: 10 }]);
});

afterEach(() => {
  stopUploadOrchestrator();
});

describe('stage drain result contract (#257)', () => {
  it('retries when the drain resolves with failed rows, then completes after a confirmed drain', async () => {
    mockDrain
      .mockResolvedValueOnce({ synced: 0, dropped: 0, failed: 1 })
      .mockResolvedValueOnce({ synced: 1, dropped: 0, failed: 0 });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    await waitFor(() => armedTimers().length === 1);

    // First pass left the row pending: no `complete`, one retry armed.
    expect(eventTypes()).not.toContain('complete');
    expect(armedTimers().map(timer => timer.delay)).toEqual([
      sessionRetryDelayMs(1),
    ]);

    // Retry confirms the stage: only now does `complete` fire.
    armedTimers()[0]?.callback();
    await waitFor(() => eventTypes().includes('complete'));
    expect(mockDrain).toHaveBeenCalledTimes(2);
    expect(eventTypes().filter(type => type === 'complete')).toHaveLength(1);
  });

  it('emits complete on the first pass when the drain confirms every row', async () => {
    mockDrain.mockResolvedValue({ synced: 1, dropped: 0, failed: 0 });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    expect(mockDrain).toHaveBeenCalledTimes(1);
    expect(armedTimers()).toHaveLength(0);
  });

  it('stops retrying once the budget is spent on permanently pending rows, without complete', async () => {
    mockDrain.mockResolvedValue({ synced: 0, dropped: 0, failed: 1 });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    for (let attempt = 1; attempt < SESSION_RETRY_MAX_ATTEMPTS; attempt += 1) {
      await waitFor(() => mockDrain.mock.calls.length === attempt);
      await waitFor(() => armedTimers().length === 1);
      armedTimers()[0]?.callback();
    }
    await waitFor(
      () => mockDrain.mock.calls.length === SESSION_RETRY_MAX_ATTEMPTS,
    );
    await settle();

    expect(armedTimers()).toHaveLength(0);
    expect(eventTypes()).not.toContain('complete');
  });

  it('does not retry or complete when the session is stopped during the drain', async () => {
    let finishDrain!: (value: {
      synced: number;
      dropped: number;
      failed: number;
    }) => void;
    mockDrain.mockImplementation(
      () =>
        new Promise(resolve => {
          finishDrain = resolve;
        }),
    );
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    stopUploadOrchestrator();
    finishDrain({ synced: 0, dropped: 0, failed: 1 });
    await settle();

    expect(armedTimers()).toHaveLength(0);
    expect(eventTypes()).not.toContain('complete');
  });
});
