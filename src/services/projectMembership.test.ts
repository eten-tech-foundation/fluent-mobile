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
  getVerifiedMembershipOwners,
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
