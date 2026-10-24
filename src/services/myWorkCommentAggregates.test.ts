import { AuthError } from './authError';
import {
  clearMyWorkCommentAggregates,
  getCommentAggregateCacheEntry,
  invalidateMyWorkCommentAggregateRefresh,
  persistCommentAggregate,
  refreshMyWorkCommentAggregates,
} from './myWorkCommentAggregates';

const mockGetCommentAggregate = jest.fn();
jest.mock('./api', () => ({
  FluentAPI: {
    getCommentAggregate: (...args: unknown[]) =>
      mockGetCommentAggregate(...args),
  },
}));

const mockGetCredentials = jest.fn();
jest.mock('./keychain', () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

const mockEmitAuthReauthRequired = jest.fn();
jest.mock('./syncEvents', () => ({
  emitAuthReauthRequired: (...args: unknown[]) =>
    mockEmitAuthReauthRequired(...args),
}));

const mockStore = new Map<string, string>();
const mockGetActiveUserId = jest.fn();
const mockGetKnownUserIds = jest.fn();
const mockIsReauthRequired = jest.fn();
const mockSetReauthRequired = jest.fn();

jest.mock('./storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  getKnownUserIds: (...args: unknown[]) => mockGetKnownUserIds(...args),
  isReauthRequired: (...args: unknown[]) => mockIsReauthRequired(...args),
  setReauthRequired: (...args: unknown[]) => mockSetReauthRequired(...args),
  kvStorage: {
    getItemSync: (key: string) => mockStore.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItemSync: (key: string) => {
      mockStore.delete(key);
    },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('myWorkCommentAggregates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    mockGetKnownUserIds.mockReturnValue(['7', '8']);
    mockGetActiveUserId.mockReturnValue('7');
    mockIsReauthRequired.mockReturnValue(false);
    mockGetCredentials.mockReset();
    mockGetCredentials.mockResolvedValue({ token: 'tok-7' });
    mockGetCommentAggregate.mockReset();
  });

  it('isolates known entries by userId and chapterAssignmentId', () => {
    persistCommentAggregate('7', {
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: false,
    });
    persistCommentAggregate('8', {
      chapterAssignmentId: 9,
      commentCount: 1,
      currentUserHasCommented: true,
    });

    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'known',
      commentCount: 4,
      currentUserHasCommented: false,
    });
    expect(getCommentAggregateCacheEntry('8', 9)).toEqual({
      status: 'known',
      commentCount: 1,
      currentUserHasCommented: true,
    });
    expect(getCommentAggregateCacheEntry('7', 10)).toEqual({
      status: 'unknown',
    });
  });

  it('keeps verified zero/false as known', () => {
    persistCommentAggregate('7', {
      chapterAssignmentId: 1,
      commentCount: 0,
      currentUserHasCommented: false,
    });
    expect(getCommentAggregateCacheEntry('7', 1)).toEqual({
      status: 'known',
      commentCount: 0,
      currentUserHasCommented: false,
    });
  });

  it('gates reads for unregistered or reauth-required accounts', () => {
    persistCommentAggregate('7', {
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: false,
    });
    mockGetKnownUserIds.mockReturnValue(['8']);
    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });

    mockGetKnownUserIds.mockReturnValue(['7']);
    mockIsReauthRequired.mockReturnValue(true);
    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });
  });

  it('refreshes via GET with explicit token and stores known payload', async () => {
    mockGetCommentAggregate.mockResolvedValue({
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: false,
    });

    await refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });

    expect(mockGetCommentAggregate).toHaveBeenCalledWith(9, 'tok-7');
    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'known',
      commentCount: 4,
      currentUserHasCommented: false,
    });
  });

  it('marks unknown on API errors and never fabricates zero', async () => {
    persistCommentAggregate('7', {
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: true,
    });
    mockGetCommentAggregate.mockRejectedValue(new Error('network'));

    await refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });

    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });
  });

  it('marks unknown on payload mismatch', async () => {
    mockGetCommentAggregate.mockResolvedValue({
      chapterAssignmentId: 8,
      commentCount: 4,
      currentUserHasCommented: false,
    });

    await refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });

    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });
  });

  it('clears only the logout user and drops stale responses after clear', async () => {
    persistCommentAggregate('7', {
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: false,
    });
    persistCommentAggregate('8', {
      chapterAssignmentId: 9,
      commentCount: 2,
      currentUserHasCommented: true,
    });

    let resolveFetch!: (value: unknown) => void;
    mockGetCommentAggregate.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve;
      }),
    );

    const refreshPromise = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });

    clearMyWorkCommentAggregates('7');
    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });
    expect(getCommentAggregateCacheEntry('8', 9)).toEqual({
      status: 'known',
      commentCount: 2,
      currentUserHasCommented: true,
    });

    resolveFetch({
      chapterAssignmentId: 9,
      commentCount: 99,
      currentUserHasCommented: true,
    });
    await refreshPromise;

    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });
  });

  it('current-session AuthError marks reauth and fails closed to unknown', async () => {
    persistCommentAggregate('7', {
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: false,
    });
    mockGetActiveUserId.mockReturnValue('7');
    mockGetCommentAggregate.mockRejectedValueOnce(
      new AuthError('session expired'),
    );

    await refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });

    expect(mockSetReauthRequired).toHaveBeenCalledWith('7');
    expect(mockEmitAuthReauthRequired).toHaveBeenCalledWith('7');
    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });
  });

  it('does not reauth a new account when an old auth error completes after token rotation', async () => {
    mockGetCredentials.mockResolvedValue({ token: 'old-tok' });
    let rejectFetch!: (reason?: unknown) => void;
    mockGetCommentAggregate.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      }),
    );

    const refreshPromise = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'old-tok',
      chapterAssignmentIds: [9],
    });
    await flushMicrotasks();
    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(1);

    mockGetCredentials.mockResolvedValue({ token: 'new-tok' });
    invalidateMyWorkCommentAggregateRefresh('7');

    rejectFetch(new AuthError('revoked'));
    await refreshPromise;

    expect(mockSetReauthRequired).not.toHaveBeenCalled();
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();
  });

  it('dedupes overlapping refreshes for the same account/token/assignment', async () => {
    let resolveFetch!: (value: unknown) => void;
    mockGetCommentAggregate.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
    );

    const first = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });
    await flushMicrotasks();
    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(1);

    const second = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });
    await flushMicrotasks();
    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(1);

    resolveFetch({
      chapterAssignmentId: 9,
      commentCount: 3,
      currentUserHasCommented: true,
    });
    await Promise.all([first, second]);

    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(1);
    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'known',
      commentCount: 3,
      currentUserHasCommented: true,
    });
  });

  it('blocks stale write after invalidation plus token rotation', async () => {
    mockGetCredentials.mockResolvedValue({ token: 'old-tok' });
    let resolveStale!: (value: unknown) => void;
    mockGetCommentAggregate.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveStale = resolve;
        }),
    );

    const stale = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'old-tok',
      chapterAssignmentIds: [9],
    });
    await flushMicrotasks();
    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(1);

    invalidateMyWorkCommentAggregateRefresh('7');
    mockGetCredentials.mockResolvedValue({ token: 'new-tok' });
    mockGetCommentAggregate.mockResolvedValue({
      chapterAssignmentId: 9,
      commentCount: 1,
      currentUserHasCommented: false,
    });

    const fresh = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'new-tok',
      chapterAssignmentIds: [9],
    });
    await fresh;

    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'known',
      commentCount: 1,
      currentUserHasCommented: false,
    });

    resolveStale({
      chapterAssignmentId: 9,
      commentCount: 99,
      currentUserHasCommented: true,
    });
    await stale;

    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'known',
      commentCount: 1,
      currentUserHasCommented: false,
    });
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
  });

  it('does not write when active account switches mid-flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    mockGetCommentAggregate.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
    );

    const refreshPromise = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: [9],
    });
    await flushMicrotasks();
    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(1);

    mockGetActiveUserId.mockReturnValue('8');
    resolveFetch({
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: true,
    });
    await refreshPromise;

    expect(getCommentAggregateCacheEntry('7', 9)).toEqual({
      status: 'unknown',
    });
  });

  it('bounds concurrent aggregate GETs', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let releaseGate!: () => void;
    const gate = new Promise<void>(resolve => {
      releaseGate = resolve;
    });

    mockGetCommentAggregate.mockImplementation(
      async (chapterAssignmentId: number) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gate;
        inFlight -= 1;
        return {
          chapterAssignmentId,
          commentCount: 0,
          currentUserHasCommented: false,
        };
      },
    );

    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const refreshPromise = refreshMyWorkCommentAggregates({
      userId: '7',
      sessionToken: 'tok-7',
      chapterAssignmentIds: ids,
    });

    await flushMicrotasks();
    expect(maxInFlight).toBe(4);
    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(4);

    releaseGate();
    await refreshPromise;

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(mockGetCommentAggregate).toHaveBeenCalledTimes(ids.length);
  });
});
