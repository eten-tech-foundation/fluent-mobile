const mockGetUserProjects = jest.fn();
jest.mock('./api', () => ({
  FluentAPI: {
    getUserProjects: (...args: unknown[]) => mockGetUserProjects(...args),
  },
}));

const mockGetCredentials = jest.fn();
jest.mock('./keychain', () => ({
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

const mockInsertUserProjects = jest.fn();
const mockReconcileUserProjects = jest.fn();
const mockSelectExistingIds = jest.fn();
jest.mock('../db/repository', () => ({
  insertUserProjects: (...args: unknown[]) => mockInsertUserProjects(...args),
  reconcileUserProjects: (...args: unknown[]) =>
    mockReconcileUserProjects(...args),
  selectExistingIds: (...args: unknown[]) => mockSelectExistingIds(...args),
}));

const mockSetReauthRequired = jest.fn();
const mockGetActiveUserId = jest.fn();
jest.mock('./storage', () => ({
  setReauthRequired: (...args: unknown[]) => mockSetReauthRequired(...args),
  getActiveUserId: () => mockGetActiveUserId(),
}));

const mockEmitAuthReauthRequired = jest.fn();
jest.mock('./syncEvents', () => ({
  emitAuthReauthRequired: (...args: unknown[]) =>
    mockEmitAuthReauthRequired(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      info: function (): void {},
      error: function (): void {},
      warn: function (): void {},
    }),
  },
}));

import { ApiError } from '../types/api/errors';
import { AuthError } from './authError';
import {
  beginMembershipCheck,
  getVerifiedMembershipOwners,
  invalidateVerifiedMembershipOwners,
  OWNER_CREDENTIALS_MISSING,
  refreshMembershipForOwners,
  refreshProjectMembership,
} from './projectMembership';

describe('refreshProjectMembership (#848)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCredentials.mockResolvedValue({ token: 'tok-1' });
    mockGetUserProjects.mockResolvedValue({ data: [{ id: 10 }, { id: 20 }] });
    mockSelectExistingIds.mockResolvedValue(new Set([10]));
    mockInsertUserProjects.mockResolvedValue(undefined);
    mockReconcileUserProjects.mockResolvedValue(undefined);
  });

  it('writes current memberships and drops the projects the account left', async () => {
    await refreshProjectMembership(1);

    expect(mockGetUserProjects).toHaveBeenCalledWith(1, 'tok-1');
    // Only cached projects may be inserted (FK parent row must exist).
    expect(mockInsertUserProjects).toHaveBeenCalledWith(1, [10]);
    // Every current id is kept; anything else for this user is deleted.
    expect(mockReconcileUserProjects).toHaveBeenCalledWith(1, [10, 20]);
  });

  it('uses the active account token rather than the global bearer', async () => {
    await refreshProjectMembership(2);

    expect(mockGetCredentials).toHaveBeenCalledWith('2');
    expect(mockGetUserProjects).toHaveBeenCalledWith(2, 'tok-1');
  });

  it('rejects without credentials so callers defer instead of uploading', async () => {
    mockGetCredentials.mockResolvedValue(null);

    await expect(refreshProjectMembership(1)).rejects.toThrow(
      'No credentials for user 1',
    );
    expect(mockGetUserProjects).not.toHaveBeenCalled();
    expect(mockReconcileUserProjects).not.toHaveBeenCalled();
  });

  it('rejects on an unexpected response shape without wiping cached membership', async () => {
    mockGetUserProjects.mockResolvedValue({ data: { message: 'nope' } });

    await expect(refreshProjectMembership(1)).rejects.toThrow(
      'Unexpected project membership response shape',
    );
    expect(mockInsertUserProjects).not.toHaveBeenCalled();
    expect(mockReconcileUserProjects).not.toHaveBeenCalled();
  });

  it('propagates a transport failure', async () => {
    mockGetUserProjects.mockRejectedValue(new Error('network down'));

    await expect(refreshProjectMembership(1)).rejects.toThrow('network down');
    expect(mockReconcileUserProjects).not.toHaveBeenCalled();
  });

  it('drops an empty membership answer so every take holds', async () => {
    mockGetUserProjects.mockResolvedValue({ data: [] });
    mockSelectExistingIds.mockResolvedValue(new Set());

    await refreshProjectMembership(1);

    expect(mockInsertUserProjects).toHaveBeenCalledWith(1, []);
    expect(mockReconcileUserProjects).toHaveBeenCalledWith(1, []);
  });

  it('de-duplicates repeated project ids', async () => {
    mockGetUserProjects.mockResolvedValue({
      data: [{ id: 10 }, { id: 10 }, { id: 20 }],
    });

    await refreshProjectMembership(1);

    expect(mockReconcileUserProjects).toHaveBeenCalledWith(1, [10, 20]);
  });

  it('treats a genuine empty list as no projects', async () => {
    mockGetUserProjects.mockResolvedValue({ data: [] });
    mockSelectExistingIds.mockResolvedValue(new Set());

    await refreshProjectMembership(1);

    expect(mockReconcileUserProjects).toHaveBeenCalledWith(1, []);
  });

  it.each([
    ['no usable id at all', [{ unexpected: 100 }]],
    ['a zero id', [{ id: 10 }, { id: 0 }]],
    ['a null id', [{ id: 10 }, { id: null }]],
    ['a null entry', [{ id: 10 }, null]],
    ['a negative id', [{ id: -3 }]],
    ['a boolean id', [{ id: 10 }, { id: true }]],
    ['a numeric string id', [{ id: '7' }]],
    ['a one-element array id', [{ id: [7] }]],
    ['a fractional id', [{ id: 1.5 }]],
    ['a non-finite id', [{ id: Number.POSITIVE_INFINITY }]],
  ])(
    'rejects the whole response when it has %s and leaves the cache alone',
    async (_label, data) => {
      mockGetUserProjects.mockResolvedValue({ data });

      await expect(refreshProjectMembership(1)).rejects.toThrow(
        'Unexpected project membership entry',
      );
      expect(mockInsertUserProjects).not.toHaveBeenCalled();
      expect(mockReconcileUserProjects).not.toHaveBeenCalled();
    },
  );

  it('leaves the owner unverified when the payload is malformed', async () => {
    mockGetUserProjects.mockResolvedValue({ data: [{ unexpected: 100 }] });

    const verified = await refreshMembershipForOwners([1]);

    expect([...verified]).toEqual([]);
    expect(mockReconcileUserProjects).not.toHaveBeenCalled();
  });

  it('rejects without an active user', async () => {
    await expect(refreshProjectMembership(null)).rejects.toThrow(
      'An active user is required',
    );
    expect(mockGetUserProjects).not.toHaveBeenCalled();
  });
});

describe('missing credentials (#855)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCredentials.mockResolvedValue(null);
  });

  it('throws an AuthError carrying the missing-credentials code', async () => {
    const error = await refreshProjectMembership(1).catch(e => e);

    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe(OWNER_CREDENTIALS_MISSING);
  });
});

describe('refreshMembershipForOwners (#855)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProjects.mockResolvedValue({ data: [{ id: 10 }] });
    mockSelectExistingIds.mockResolvedValue(new Set([10]));
    mockInsertUserProjects.mockResolvedValue(undefined);
    mockReconcileUserProjects.mockResolvedValue(undefined);
    mockGetActiveUserId.mockReturnValue('1');
    mockGetCredentials.mockImplementation(async (id: string) =>
      id === '2' ? null : { token: `tok-${id}` },
    );
  });

  it('verifies every owner it can confirm and leaves the rest out', async () => {
    const verified = await refreshMembershipForOwners([1, 2, 3]);

    expect([...verified].sort()).toEqual([1, 3]);
    expect([...getVerifiedMembershipOwners()].sort()).toEqual([1, 3]);
    expect(mockReconcileUserProjects).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one owner fails with a transport error', async () => {
    mockGetUserProjects.mockImplementation(async (id: number) => {
      if (id === 1) throw new Error('offline');
      return { data: [{ id: 10 }] };
    });

    const verified = await refreshMembershipForOwners([1, 3]);

    expect([...verified]).toEqual([3]);
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
  });

  it('flags reauth for an owner without credentials and signals only the active one', async () => {
    await refreshMembershipForOwners([2]);
    expect(mockSetReauthRequired).toHaveBeenCalledWith('2');
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();

    mockGetActiveUserId.mockReturnValue('2');
    await refreshMembershipForOwners([2]);
    expect(mockEmitAuthReauthRequired).toHaveBeenCalledWith('2');
  });

  it('flags reauth when the server rejects an owner token with another AuthError code', async () => {
    mockGetUserProjects.mockImplementation(async (id: number) => {
      if (id === 3) throw new AuthError('Session expired', 'TOKEN_EXPIRED');
      return { data: [{ id: 10 }] };
    });

    const verified = await refreshMembershipForOwners([1, 3]);

    expect([...verified]).toEqual([1]);
    expect(mockSetReauthRequired).toHaveBeenCalledWith('3');
    expect(mockSetReauthRequired).not.toHaveBeenCalledWith('1');
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();

    mockGetActiveUserId.mockReturnValue('3');
    await refreshMembershipForOwners([3]);
    expect(mockEmitAuthReauthRequired).toHaveBeenCalledWith('3');
  });

  it('does not flag reauth for a non-auth API failure', async () => {
    mockGetUserProjects.mockRejectedValue(
      new ApiError(500, 'Server error', 'SERVER_ERROR'),
    );

    const verified = await refreshMembershipForOwners([1]);

    expect([...verified]).toEqual([]);
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();
  });

  it('checks each owner once and replaces the previous verified set', async () => {
    await refreshMembershipForOwners([1, 1, 3]);
    expect(mockGetUserProjects).toHaveBeenCalledTimes(2);

    await refreshMembershipForOwners([3]);
    expect([...getVerifiedMembershipOwners()]).toEqual([3]);
  });
});

describe('membership checks from overlapping sessions (#855)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProjects.mockResolvedValue({ data: [{ id: 10 }] });
    mockSelectExistingIds.mockResolvedValue(new Set([10]));
    mockInsertUserProjects.mockResolvedValue(undefined);
    mockReconcileUserProjects.mockResolvedValue(undefined);
    mockGetActiveUserId.mockReturnValue('1');
    mockGetCredentials.mockImplementation(async (id: string) => ({
      token: `tok-${id}`,
    }));
  });

  it("does not let an older check's failure clear a newer check's owners", async () => {
    // The older session starts its check, then fails in its owner lookup
    // after a newer session's check has succeeded.
    const older = beginMembershipCheck();
    const newer = beginMembershipCheck();
    await refreshMembershipForOwners([1], newer);
    expect([...getVerifiedMembershipOwners()]).toEqual([1]);

    invalidateVerifiedMembershipOwners(older);

    expect([...getVerifiedMembershipOwners()]).toEqual([1]);
  });

  it("does not let an older refresh that fails late clear a newer check's owners", async () => {
    let failOlder!: () => void;
    mockGetUserProjects.mockImplementation(async (id: number) => {
      if (id === 2) {
        await new Promise<void>(resolve => {
          failOlder = resolve;
        });
        throw new Error('offline');
      }
      return { data: [{ id: 10 }] };
    });
    const older = beginMembershipCheck();
    const olderRefresh = refreshMembershipForOwners([2], older);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const newer = beginMembershipCheck();
    await refreshMembershipForOwners([1], newer);

    failOlder();
    const olderVerified = await olderRefresh;
    expect(olderVerified.size).toBe(0);
    // The older check would now invalidate after its empty result.
    invalidateVerifiedMembershipOwners(older);

    // Neither its empty result nor its invalidation replaced the newer set.
    expect([...getVerifiedMembershipOwners()]).toEqual([1]);
  });

  it('clears the owners when the latest check fails', async () => {
    const earlier = beginMembershipCheck();
    await refreshMembershipForOwners([1], earlier);
    expect([...getVerifiedMembershipOwners()]).toEqual([1]);

    const latest = beginMembershipCheck();
    invalidateVerifiedMembershipOwners(latest);

    expect(getVerifiedMembershipOwners().size).toBe(0);
  });

  it('claims its own generation when called without one', async () => {
    const stale = beginMembershipCheck();
    await refreshMembershipForOwners([1]);

    // A newer (unscoped) refresh has run since `stale` was claimed.
    invalidateVerifiedMembershipOwners(stale);
    expect([...getVerifiedMembershipOwners()]).toEqual([1]);
  });
});
