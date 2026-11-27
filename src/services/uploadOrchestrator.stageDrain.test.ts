// Production wiring (#257, #886): `pushPendingStageAdvancesAfterUpload` must turn
// a drain that resolved with `{ failed > 0 }` or offline `{ deferred > 0 }` into
// a session failure so the bounded retry runs and `complete` (which refreshes
// My Work) only follows a confirmed drain. The drain itself is mocked at its
// production result contract.
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
const mockReconcileHeldRecordings = jest.fn();
const mockHasHeldRecordingsForUser = jest.fn();
const mockListeners = new Set<ConnectivityListener>();
const mockDrain = jest.fn();
const mockClaimsDrain = jest.fn();
const mockGetPendingStageAdvances = jest.fn();
const mockHasPendingChapterClaimsForUser = jest.fn();
const mockEmit = jest.fn();
const mockGetCredentials = jest.fn();
const mockSetReauthRequired = jest.fn();
const mockEmitReauth = jest.fn();

jest.mock('../db/queries', () => ({
  getPendingUploadChapters: async () => [],
  hasPendingChapterClaimsForUser: (userId: number) =>
    mockHasPendingChapterClaimsForUser(userId),
}));
jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: () => mockGetPendingStageAdvances(),
}));
jest.mock('../db/repositories/heldRecordingsRepository', () => ({
  reconcileHeldRecordings: (...args: unknown[]) =>
    mockReconcileHeldRecordings(...args),
  getRecordingOwnerIds: async (id: number | null) => (id === null ? [] : [id]),
  hasHeldRecordingsForUser: (userId: number) =>
    mockHasHeldRecordingsForUser(userId),
}));
// Membership refresh is exercised in projectMembership.test.ts; here it must
// resolve so these drain sessions still run (#848).
jest.mock('./projectMembership', () => {
  let verified = new Set<number>();
  return {
    refreshProjectMembership: async () => undefined,
    refreshMembershipForOwners: async (ids: number[]) => {
      verified = new Set(ids);
      return verified;
    },
    getVerifiedMembershipOwners: () => verified,
  };
});
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
  getRecentOnlineReachability: () => null,
}));
jest.mock('./userPreferences', () => ({
  getUploadOverCellular: () => false,
  subscribeToPreference: () => () => undefined,
}));
jest.mock('./storage', () => ({
  getActiveUserId: () => '10',
  getSyncPausedUntilMs: () => null,
  setSyncPausedUntilMs: jest.fn(),
  setReauthRequired: (id: string) => mockSetReauthRequired(id),
}));
jest.mock('./sync', () => ({
  syncPendingChapterClaimsForUser: (...args: unknown[]) =>
    mockClaimsDrain(...args),
  syncPendingStageAdvancesForUser: (...args: unknown[]) => mockDrain(...args),
}));
jest.mock('./keychain', () => ({
  getCredentials: (id: string) => mockGetCredentials(id),
}));
jest.mock('./syncEvents', () => ({
  emitHeldRecordingsChanged: jest.fn(),
  emitUploadSessionEvent: (event: UploadSessionEvent) => mockEmit(event),
  emitAuthReauthRequired: (id: string) => mockEmitReauth(id),
  onSyncComplete: jest.fn(),
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
  mockGetCredentials.mockResolvedValue({ token: 'token-10' });
  timers = [];
  mockGetPendingStageAdvances.mockResolvedValue([{ id: 1, userId: 10 }]);
  mockHasPendingChapterClaimsForUser.mockResolvedValue(false);
  mockClaimsDrain.mockResolvedValue({ synced: 0, conflicts: 0, failed: 0 });
  mockReconcileHeldRecordings.mockResolvedValue({ held: 0, released: 0 });
  mockHasHeldRecordingsForUser.mockResolvedValue(false);
});
afterEach(() => {
  stopUploadOrchestrator();
});

describe('stage drain result contract (#257)', () => {
  it('fails closed before draining a claim with missing captured-owner credentials', async () => {
    mockGetCredentials.mockResolvedValue(null);
    mockHasPendingChapterClaimsForUser.mockResolvedValue(true);
    startUploadOrchestrator({ schedule, worker: stubWorker });
    connect();
    await waitFor(() => mockSetReauthRequired.mock.calls.length > 0);
    expect(mockSetReauthRequired).toHaveBeenCalledWith('10');
    expect(mockEmitReauth).toHaveBeenCalledWith('10');
    expect(mockClaimsDrain).not.toHaveBeenCalled();
    expect(mockDrain).not.toHaveBeenCalled();
    expect(stubWorker.uploadChapter).not.toHaveBeenCalled();
    expect(eventTypes()).not.toContain('complete');
  });

  it('retries when the drain resolves with failed rows, then completes after a confirmed drain', async () => {
    mockDrain
      .mockResolvedValueOnce({ synced: 0, dropped: 0, failed: 1 })
      .mockResolvedValueOnce({ synced: 1, dropped: 0, failed: 0 });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    await waitFor(() => armedTimers().length === 1);

    expect(eventTypes()).not.toContain('complete');
    expect(armedTimers().map(timer => timer.delay)).toEqual([
      sessionRetryDelayMs(1),
    ]);

    armedTimers()[0]?.callback();
    await waitFor(() => eventTypes().includes('complete'));
    expect(mockDrain).toHaveBeenCalledTimes(2);
    expect(eventTypes().filter(type => type === 'complete')).toHaveLength(1);
  });

  it('retries when the drain defers offline rows, and does not emit complete', async () => {
    mockDrain.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 2,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    await waitFor(() => armedTimers().length === 1);

    expect(eventTypes()).not.toContain('complete');
    expect(armedTimers().map(timer => timer.delay)).toEqual([
      sessionRetryDelayMs(1),
    ]);
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

  it('treats offline-deferred rows as a connectivity pause, not complete or a retry (#886)', async () => {
    mockDrain.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 1,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    await waitFor(() => eventTypes().includes('paused'));

    expect(mockEmit).toHaveBeenCalledWith({
      type: 'paused',
      reason: 'connectivity',
    });
    expect(eventTypes()).not.toContain('complete');
    expect(eventTypes()).not.toContain('idle');
    expect(armedTimers()).toHaveLength(1);
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

describe('claim push result contract (#886)', () => {
  it('treats an offline-deferred claim push as a connectivity pause, not something to upload past', async () => {
    mockClaimsDrain.mockResolvedValue({
      synced: 0,
      conflicts: 0,
      failed: 0,
      deferred: 1,
    });
    mockDrain.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockClaimsDrain.mock.calls.length === 1);
    await waitFor(() => eventTypes().includes('paused'));

    expect(mockClaimsDrain).toHaveBeenCalledWith(10, 'token-10');
    expect(mockEmit).toHaveBeenCalledWith({
      type: 'paused',
      reason: 'connectivity',
    });
    expect(mockDrain).not.toHaveBeenCalled();
    expect(eventTypes()).not.toContain('complete');
    expect(eventTypes()).not.toContain('idle');
  });

  it('runs a claim-only session on reconnect when only a queued claim is pending', async () => {
    mockGetPendingStageAdvances.mockResolvedValue([]);
    mockHasPendingChapterClaimsForUser.mockResolvedValue(true);
    mockDrain.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    expect(mockHasPendingChapterClaimsForUser).toHaveBeenCalledWith(10);
    expect(mockClaimsDrain).toHaveBeenCalledWith(10, 'token-10');
    expect(stubWorker.uploadChapter).not.toHaveBeenCalled();
  });

  describe('a claim that lands for held takes (#855)', () => {
    beforeEach(() => {
      mockGetPendingStageAdvances.mockResolvedValue([]);
      mockDrain.mockResolvedValue({
        synced: 0,
        dropped: 0,
        failed: 0,
        deferred: 0,
      });
      // The automatic claim stays queued until a push lands it.
      let claimQueued = true;
      mockHasPendingChapterClaimsForUser.mockImplementation(
        async () => claimQueued,
      );
      mockClaimsDrain.mockImplementation(async () => {
        const synced = claimQueued ? 1 : 0;
        claimQueued = false;
        return { synced, conflicts: 0, failed: 0 };
      });
    });

    it('runs a follow-up session so the held takes release and upload', async () => {
      mockHasHeldRecordingsForUser.mockResolvedValue(true);
      startUploadOrchestrator({ schedule, worker: stubWorker });

      connect();
      await waitFor(() => mockReconcileHeldRecordings.mock.calls.length >= 2);
      await settle();

      expect(mockHasHeldRecordingsForUser).toHaveBeenCalledWith(10);
      // One reconcile per session: the claim session, then the follow-up
      // that releases the takes now that the claim has landed.
      expect(mockReconcileHeldRecordings).toHaveBeenCalledTimes(2);
    });

    it('does not run a follow-up session when the account holds nothing', async () => {
      startUploadOrchestrator({ schedule, worker: stubWorker });

      connect();
      await waitFor(() => eventTypes().includes('complete'));
      await settle();

      expect(mockReconcileHeldRecordings).toHaveBeenCalledTimes(1);
    });
  });

  it('runs the claim push on reconnect when the claim queue cannot be read', async () => {
    mockGetPendingStageAdvances.mockResolvedValue([]);
    mockHasPendingChapterClaimsForUser.mockRejectedValue(
      new Error('db closed'),
    );
    mockDrain.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    expect(mockClaimsDrain).toHaveBeenCalledWith(10, 'token-10');
  });

  it('retries a drain-only session when the claim push leaves rows failed', async () => {
    mockGetPendingStageAdvances.mockResolvedValue([]);
    mockHasPendingChapterClaimsForUser.mockResolvedValue(true);
    mockClaimsDrain.mockResolvedValue({ synced: 0, conflicts: 0, failed: 1 });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockClaimsDrain.mock.calls.length === 1);
    await waitFor(() => armedTimers().length === 1);

    expect(eventTypes()).not.toContain('complete');
    expect(armedTimers().map(timer => timer.delay)).toEqual([
      sessionRetryDelayMs(1),
    ]);
  });

  it('still drains queued stage advances when the claim push soft-fails, then retries', async () => {
    mockGetPendingStageAdvances.mockResolvedValue([{ id: 1, userId: 10 }]);
    mockHasPendingChapterClaimsForUser.mockResolvedValue(true);
    mockClaimsDrain.mockResolvedValue({ synced: 0, conflicts: 0, failed: 1 });
    mockDrain.mockResolvedValue({
      synced: 1,
      dropped: 0,
      failed: 0,
      deferred: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    await waitFor(() => armedTimers().length === 1);

    expect(mockClaimsDrain).toHaveBeenCalledTimes(1);
    expect(eventTypes()).not.toContain('complete');
    expect(armedTimers().map(timer => timer.delay)).toEqual([
      sessionRetryDelayMs(1),
    ]);
  });

  it('stays idle on reconnect with no chapters, stage rows or claims', async () => {
    mockGetPendingStageAdvances.mockResolvedValue([]);
    mockHasPendingChapterClaimsForUser.mockResolvedValue(false);
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('idle'));
    await settle();

    expect(mockClaimsDrain).not.toHaveBeenCalled();
    expect(eventTypes()).not.toContain('complete');
  });
});
