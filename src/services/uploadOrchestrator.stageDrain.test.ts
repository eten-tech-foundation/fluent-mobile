// Production wiring (#257, #886): `pushPendingStageAdvancesAfterUpload` must turn
// a drain that resolved with `{ failed > 0 }` or offline `{ deferred > 0 }` into
// a session failure so the bounded retry runs and `complete` (which refreshes
// My Work) only follows a confirmed drain. The drain itself is mocked at its
// production result contract.
import type { UploadSessionEvent } from './syncEvents';
import { AuthError } from './authError';
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
const mockClaimsDrain = jest.fn();
const mockOtherAccountClaimsDrain = jest.fn();
const mockGetPendingStageAdvances = jest.fn();
const mockGetPendingChapterClaims = jest.fn();
const mockEmit = jest.fn();
const mockGetCredentials = jest.fn();
const mockSetReauthRequired = jest.fn();
const mockEmitReauth = jest.fn();
const mockIsReauthRequired = jest.fn();

jest.mock('../db/queries', () => ({
  getDevicePendingUploadChapters: async () => [],
  getPendingChapterClaims: () => mockGetPendingChapterClaims(),
}));
jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: () => mockGetPendingStageAdvances(),
}));
jest.mock('../db/repositories/heldRecordingsRepository', () => ({
  reconcileHeldRecordings: async () => ({ held: 0, released: 0 }),
  getRecordingOwnerIds: async (id: number | null) => (id === null ? [] : [id]),
}));
// Membership refresh is exercised in projectMembership.test.ts; here it must
// resolve so these drain sessions still run (#848).
const mockRefreshOwners = jest.fn();
jest.mock('./projectMembership', () => {
  let verified = new Set<number>();
  return {
    refreshProjectMembership: async () => undefined,
    refreshMembershipForOwners: async (ids: number[]) => {
      mockRefreshOwners([...ids].sort((a, b) => a - b));
      verified = new Set(ids);
      return verified;
    },
    getVerifiedMembershipOwners: () => verified,
    beginMembershipCheck: () => 1,
    invalidateVerifiedMembershipOwners: () => {
      verified = new Set();
    },
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
  isReauthRequired: (id: string) => mockIsReauthRequired(id),
  getActiveUserId: () => '10',
  getSyncPausedUntilMs: () => null,
  setSyncPausedUntilMs: jest.fn(),
  setReauthRequired: (id: string) => mockSetReauthRequired(id),
}));
jest.mock('./sync', () => ({
  syncPendingChapterClaimsForUser: (...args: unknown[]) =>
    mockClaimsDrain(...args),
  syncPendingStageAdvancesForAccounts: (...args: unknown[]) =>
    mockDrain(...args),
}));
jest.mock('./chapterClaimSync', () => ({
  syncPendingChapterClaims: (...args: unknown[]) =>
    mockOtherAccountClaimsDrain(...args),
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
  mockIsReauthRequired.mockReturnValue(false);
  timers = [];
  mockGetPendingStageAdvances.mockResolvedValue([{ id: 1, userId: 10 }]);
  mockGetPendingChapterClaims.mockResolvedValue([]);
  mockClaimsDrain.mockResolvedValue({ synced: 0, conflicts: 0, failed: 0 });
  mockOtherAccountClaimsDrain.mockResolvedValue({
    synced: 0,
    conflicts: 0,
    failed: 0,
  });
});
afterEach(() => {
  stopUploadOrchestrator();
});

describe('stage drain result contract (#257)', () => {
  it('fails closed before draining a claim with missing captured-owner credentials', async () => {
    mockGetCredentials.mockResolvedValue(null);
    mockGetPendingChapterClaims.mockResolvedValue([{ id: 1, userId: 10 }]);
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
    mockGetPendingChapterClaims.mockResolvedValue([{ id: 1, userId: 10 }]);
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
    mockGetPendingChapterClaims.mockResolvedValue([{ id: 1, userId: 10 }]);
    mockDrain.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    expect(mockGetPendingChapterClaims).toHaveBeenCalled();
    expect(mockClaimsDrain).toHaveBeenCalledWith(10, 'token-10');
    expect(stubWorker.uploadChapter).not.toHaveBeenCalled();
  });

  it('runs the claim push on reconnect when the claim queue cannot be read', async () => {
    mockGetPendingStageAdvances.mockResolvedValue([]);
    mockGetPendingChapterClaims.mockRejectedValue(new Error('db closed'));
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
    mockGetPendingChapterClaims.mockResolvedValue([{ id: 1, userId: 10 }]);
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
    mockGetPendingChapterClaims.mockResolvedValue([{ id: 1, userId: 10 }]);
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
    mockGetPendingChapterClaims.mockResolvedValue([]);
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('idle'));
    await settle();

    expect(mockClaimsDrain).not.toHaveBeenCalled();
    expect(eventTypes()).not.toContain('complete');
  });
});

describe('queued work from other accounts on this device (#854)', () => {
  it("pushes another account's claims and stage advances with that account's own token", async () => {
    mockGetCredentials.mockImplementation(async (id: string) => ({
      token: `token-${id}`,
    }));
    mockGetPendingChapterClaims.mockResolvedValue([
      { id: 1, userId: 10 },
      { id: 2, userId: 20 },
    ]);
    mockGetPendingStageAdvances.mockResolvedValue([
      { id: 1, userId: 20 },
      { id: 2, userId: 10 },
    ]);
    mockDrain.mockResolvedValue({
      synced: 2,
      dropped: 0,
      failed: 0,
      deferred: 0,
      blocked: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    // The active account's claims go through the sync-error-tracking wrapper;
    // another account's drain directly, outside the active account's sync
    // error state.
    expect(mockClaimsDrain.mock.calls).toEqual([[10, 'token-10']]);
    expect(mockOtherAccountClaimsDrain.mock.calls).toEqual([[20, 'token-20']]);
    expect(mockDrain).toHaveBeenCalledWith(
      new Map([
        [20, 'token-20'],
        [10, 'token-10'],
      ]),
    );
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
  });

  it("keeps a signed-out account pending and flagged, and still completes the active account's session", async () => {
    mockGetCredentials.mockImplementation(async (id: string) =>
      id === '20' ? null : { token: `token-${id}` },
    );
    mockGetPendingChapterClaims.mockResolvedValue([
      { id: 1, userId: 10 },
      { id: 2, userId: 20 },
    ]);
    mockGetPendingStageAdvances.mockResolvedValue([
      { id: 1, userId: 20 },
      { id: 2, userId: 10 },
    ]);
    mockDrain.mockResolvedValue({
      synced: 1,
      dropped: 0,
      failed: 0,
      deferred: 0,
      blocked: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    // The active account's work still goes; the other account's never borrows it.
    expect(mockClaimsDrain.mock.calls).toEqual([[10, 'token-10']]);
    expect(mockOtherAccountClaimsDrain).not.toHaveBeenCalled();
    expect(mockDrain).toHaveBeenCalledWith(new Map([[10, 'token-10']]));
    // Flagged for the Sync page, but the active account is not sent to sign-in.
    expect(mockSetReauthRequired).toHaveBeenCalledWith('20');
    expect(mockEmitReauth).not.toHaveBeenCalled();
    expect(armedTimers()).toHaveLength(0);
  });

  it("does not complete while the active account's stage advance waits behind a signed-out account", async () => {
    mockGetCredentials.mockImplementation(async (id: string) =>
      id === '20' ? null : { token: `token-${id}` },
    );
    mockGetPendingStageAdvances.mockResolvedValue([
      { id: 1, userId: 20 },
      { id: 2, userId: 10 },
    ]);
    mockDrain.mockResolvedValue({
      synced: 0,
      dropped: 0,
      failed: 0,
      deferred: 0,
      blocked: 1,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    await waitFor(() => armedTimers().length === 1);

    expect(eventTypes()).not.toContain('complete');
  });

  it("keeps another account's claims queued when its session is rejected, and flags it", async () => {
    mockGetCredentials.mockImplementation(async (id: string) => ({
      token: `token-${id}`,
    }));
    mockGetPendingChapterClaims.mockResolvedValue([
      { id: 1, userId: 20 },
      { id: 2, userId: 10 },
    ]);
    mockGetPendingStageAdvances.mockResolvedValue([]);
    mockOtherAccountClaimsDrain.mockRejectedValue(
      new AuthError('expired', 'TOKEN_EXPIRED'),
    );
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    expect(mockSetReauthRequired).toHaveBeenCalledWith('20');
    expect(mockEmitReauth).not.toHaveBeenCalled();
    expect(mockClaimsDrain).toHaveBeenCalledWith(10, 'token-10');
  });

  it("still ends the session into sign-in when the active account's claim push is rejected", async () => {
    mockGetPendingChapterClaims.mockResolvedValue([{ id: 1, userId: 10 }]);
    mockClaimsDrain.mockRejectedValue(
      new AuthError('expired', 'TOKEN_EXPIRED'),
    );
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockClaimsDrain.mock.calls.length === 1);
    await settle();

    expect(eventTypes()).not.toContain('complete');
    expect(mockDrain).not.toHaveBeenCalled();
  });
});

describe('membership refresh for stage-advance-only accounts (#854)', () => {
  it('checks an account whose only queued work is a stage advance', async () => {
    // Account 20 has no takes on the device, only a queued stage advance.
    mockGetCredentials.mockImplementation(async (id: string) => ({
      token: `token-${id}`,
    }));
    mockGetPendingStageAdvances.mockResolvedValue([{ id: 1, userId: 20 }]);
    mockDrain.mockResolvedValue({
      synced: 1,
      dropped: 0,
      failed: 0,
      deferred: 0,
      blocked: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    // The active account (take owners list) plus the stage-only account.
    expect(mockRefreshOwners).toHaveBeenCalledWith([10, 20]);
  });
});

describe('cancelling during the claim push (#854)', () => {
  it("does not start another account's claims after a cancel", async () => {
    mockGetCredentials.mockImplementation(async (id: string) => ({
      token: `token-${id}`,
    }));
    mockGetPendingChapterClaims.mockResolvedValue([
      { id: 1, userId: 10 },
      { id: 2, userId: 20 },
    ]);
    let releaseActive!: () => void;
    mockClaimsDrain.mockImplementation(
      () =>
        new Promise(resolve => {
          releaseActive = () =>
            resolve({ synced: 1, conflicts: 0, failed: 0, deferred: 0 });
        }),
    );
    const orchestrator = startUploadOrchestrator({
      schedule,
      worker: stubWorker,
    });

    connect();
    await waitFor(() => mockClaimsDrain.mock.calls.length === 1);
    await orchestrator.cancel();
    releaseActive();
    await settle();

    expect(mockOtherAccountClaimsDrain).not.toHaveBeenCalled();
    expect(mockDrain).not.toHaveBeenCalled();
  });
});

describe('another account whose stored session was rejected (#854)', () => {
  it("does not complete when the active account's stage advance is rejected", async () => {
    mockDrain.mockRejectedValue(new AuthError('expired', 'TOKEN_EXPIRED'));
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => mockDrain.mock.calls.length === 1);
    await settle();

    expect(eventTypes()).not.toContain('complete');
  });

  it('is not sent again, and does not keep the active account from completing', async () => {
    mockGetCredentials.mockImplementation(async (id: string) => ({
      token: `token-${id}`,
    }));
    mockIsReauthRequired.mockImplementation((id: string) => id === '20');
    mockGetPendingChapterClaims.mockResolvedValue([
      { id: 1, userId: 20 },
      { id: 2, userId: 10 },
    ]);
    mockGetPendingStageAdvances.mockResolvedValue([
      { id: 1, userId: 20 },
      { id: 2, userId: 10 },
    ]);
    mockDrain.mockResolvedValue({
      synced: 1,
      dropped: 0,
      failed: 0,
      deferred: 0,
      blocked: 0,
    });
    startUploadOrchestrator({ schedule, worker: stubWorker });

    connect();
    await waitFor(() => eventTypes().includes('complete'));

    expect(mockOtherAccountClaimsDrain).not.toHaveBeenCalled();
    expect(mockClaimsDrain.mock.calls).toEqual([[10, 'token-10']]);
    expect(mockDrain).toHaveBeenCalledWith(new Map([[10, 'token-10']]));
    expect(mockEmitReauth).not.toHaveBeenCalled();
  });
});
