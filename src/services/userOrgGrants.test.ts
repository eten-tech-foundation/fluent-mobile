import { AuthError } from './authError';
import { FluentAPI } from './api';
import { getCredentials } from './keychain';
import { emitAuthReauthRequired } from './syncEvents';
import {
  clearUserOrgGrantSnapshot,
  getObserverProjectIds,
  getUserOrgGrants,
  hasProjectObserverGrant,
  markUserOrgGrantsUnknown,
  parseOrgGrantsFromUser,
  persistOrgGrantsFromUserResponse,
  PROJECT_OBSERVER_ROLE_NAME,
  refreshUserOrgGrants,
} from './userOrgGrants';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserEmail,
  isReauthRequired,
  kvStorage,
  setReauthRequired,
} from './storage';

jest.mock('./api', () => ({
  FluentAPI: {
    getUserByEmail: jest.fn(),
  },
}));

jest.mock('./keychain', () => ({
  getCredentials: jest.fn(async () => ({ token: 'token-1' })),
}));

jest.mock('./syncEvents', () => ({
  emitAuthReauthRequired: jest.fn(),
}));

jest.mock('./storage', () => {
  const store = new Map<string, string>();
  return {
    kvStorage: {
      getItemSync: jest.fn((key: string) => store.get(key) ?? null),
      setItemSync: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItemSync: jest.fn((key: string) => {
        store.delete(key);
      }),
      __store: store,
    },
    getKnownUserIds: jest.fn(() => ['1', '2']),
    getUserEmail: jest.fn((userId: string) =>
      userId === '1' ? 'one@example.com' : 'two@example.com',
    ),
    isReauthRequired: jest.fn(() => false),
    getActiveUserId: jest.fn(() => '1'),
    setReauthRequired: jest.fn(),
  };
});

const mockStore = (kvStorage as unknown as { __store: Map<string, string> })
  .__store;
const mockGetKnownUserIds = getKnownUserIds as jest.Mock;
const mockGetUserEmail = getUserEmail as jest.Mock;
const mockIsReauthRequired = isReauthRequired as jest.Mock;
const mockGetActiveUserId = getActiveUserId as jest.Mock;
const mockSetReauthRequired = setReauthRequired as jest.Mock;
const mockGetUserByEmail = FluentAPI.getUserByEmail as jest.Mock;
const mockEmitAuthReauthRequired = emitAuthReauthRequired as jest.Mock;
const mockGetCredentials = getCredentials as jest.Mock;

const observerGrant = {
  roleId: 7,
  roleName: PROJECT_OBSERVER_ROLE_NAME,
  orgId: 10,
  projectId: 100,
  orgName: 'Org A',
};

const orgOnlyObserverGrant = {
  roleId: 7,
  roleName: PROJECT_OBSERVER_ROLE_NAME,
  orgId: 10,
  projectId: null,
  orgName: 'Org A',
};

const nullOrgSuperAdminGrant = {
  roleId: 1,
  roleName: 'SuperAdmin',
  orgId: null,
  projectId: null,
};

const translatorGrant = {
  roleId: 3,
  roleName: 'Translator',
  orgId: 10,
  projectId: 100,
};

describe('parseOrgGrantsFromUser', () => {
  it('returns unknown when orgGrants is missing', () => {
    expect(parseOrgGrantsFromUser({ id: 1, email: 'a@b.c' })).toEqual({
      status: 'unknown',
    });
  });

  it('returns unknown when orgGrants is malformed', () => {
    expect(
      parseOrgGrantsFromUser({
        id: 1,
        email: 'a@b.c',
        orgGrants: 'nope' as unknown as [],
      }),
    ).toEqual({ status: 'unknown' });
    expect(
      parseOrgGrantsFromUser({
        id: 1,
        email: 'a@b.c',
        orgGrants: [{ roleId: 1 } as never],
      }),
    ).toEqual({ status: 'unknown' });
  });

  it('returns known empty for successful empty array', () => {
    expect(
      parseOrgGrantsFromUser({ id: 1, email: 'a@b.c', orgGrants: [] }),
    ).toEqual({ status: 'known', grants: [] });
  });

  it('returns known grants when all items are valid', () => {
    expect(
      parseOrgGrantsFromUser({
        id: 1,
        email: 'a@b.c',
        orgGrants: [observerGrant, translatorGrant],
      }),
    ).toEqual({
      status: 'known',
      grants: [observerGrant, translatorGrant],
    });
  });

  it('treats omitted projectId as org-scoped null', () => {
    expect(
      parseOrgGrantsFromUser({
        id: 1,
        email: 'a@b.c',
        orgGrants: [
          {
            roleId: 7,
            roleName: PROJECT_OBSERVER_ROLE_NAME,
            orgId: 10,
          } as never,
        ],
      }),
    ).toEqual({
      status: 'known',
      grants: [
        {
          roleId: 7,
          roleName: PROJECT_OBSERVER_ROLE_NAME,
          orgId: 10,
          projectId: null,
        },
      ],
    });
  });

  it('keeps null-org SuperAdmin alongside project Observer grants', () => {
    expect(
      parseOrgGrantsFromUser({
        id: 1,
        email: 'a@b.c',
        orgGrants: [
          nullOrgSuperAdminGrant,
          observerGrant,
          orgOnlyObserverGrant,
        ],
      }),
    ).toEqual({
      status: 'known',
      grants: [nullOrgSuperAdminGrant, observerGrant, orgOnlyObserverGrant],
    });
  });
});

describe('persist + read isolation', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    mockGetKnownUserIds.mockReturnValue(['1', '2']);
    mockIsReauthRequired.mockReturnValue(false);
    mockGetActiveUserId.mockReturnValue('1');
    mockGetUserEmail.mockImplementation((userId: string) =>
      userId === '1' ? 'one@example.com' : 'two@example.com',
    );
  });

  it('persists known grants and isolates by user id', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    persistOrgGrantsFromUserResponse('2', {
      id: 2,
      email: 'two@example.com',
      orgGrants: [translatorGrant],
    });

    expect(getUserOrgGrants('1')).toEqual({
      status: 'known',
      grants: [observerGrant],
    });
    expect(getUserOrgGrants('2')).toEqual({
      status: 'known',
      grants: [translatorGrant],
    });
    expect(hasProjectObserverGrant('1', 100)).toBe(true);
    expect(hasProjectObserverGrant('2', 100)).toBe(false);
  });

  it('replaces prior grants including revocation to empty', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [],
    });

    expect(getUserOrgGrants('1')).toEqual({ status: 'known', grants: [] });
    expect(hasProjectObserverGrant('1', 100)).toBe(false);
  });

  it('marks unknown on user-id mismatch instead of keeping positives', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    persistOrgGrantsFromUserResponse('1', {
      id: 99,
      email: 'other@example.com',
      orgGrants: [observerGrant],
    });

    expect(getUserOrgGrants('1')).toEqual({ status: 'unknown' });
    expect(hasProjectObserverGrant('1', 100)).toBe(false);
  });

  it('marks unknown on malformed orgGrants and does not retain positives', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: undefined,
    });

    expect(getUserOrgGrants('1')).toEqual({ status: 'unknown' });
    expect(hasProjectObserverGrant('1', 100)).toBe(false);
  });

  it('fails closed for unregistered accounts and preserves other accounts', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    mockGetKnownUserIds.mockReturnValue(['2']);

    expect(getUserOrgGrants('1')).toEqual({ status: 'unknown' });
    expect(hasProjectObserverGrant('1', 100)).toBe(false);

    mockGetKnownUserIds.mockReturnValue(['1', '2']);
    expect(hasProjectObserverGrant('1', 100)).toBe(true);
  });

  it('fails closed while reauth is required (inactive account)', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    mockIsReauthRequired.mockReturnValue(true);

    expect(getUserOrgGrants('1')).toEqual({ status: 'unknown' });
    expect(hasProjectObserverGrant('1', 100)).toBe(false);
  });

  it('excludes org-only Observer grants from project membership helpers', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [orgOnlyObserverGrant, observerGrant, translatorGrant],
    });

    expect(hasProjectObserverGrant('1', 100)).toBe(true);
    expect(hasProjectObserverGrant('1', 999)).toBe(false);
    expect(getObserverProjectIds('1')).toEqual([100]);
  });

  it('project Observer predicate ignores null-org SuperAdmin and org-only roles', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [nullOrgSuperAdminGrant, orgOnlyObserverGrant, observerGrant],
    });

    expect(hasProjectObserverGrant('1', 100)).toBe(true);
    expect(hasProjectObserverGrant('1', 10)).toBe(false);
    expect(getObserverProjectIds('1')).toEqual([100]);
  });

  it('clearUserOrgGrantSnapshot removes only that account', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    persistOrgGrantsFromUserResponse('2', {
      id: 2,
      email: 'two@example.com',
      orgGrants: [observerGrant],
    });

    clearUserOrgGrantSnapshot('1');

    expect(getUserOrgGrants('1')).toEqual({ status: 'unknown' });
    expect(getUserOrgGrants('2')).toEqual({
      status: 'known',
      grants: [observerGrant],
    });
  });
});

describe('refreshUserOrgGrants', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    mockGetKnownUserIds.mockReturnValue(['1', '2']);
    mockIsReauthRequired.mockReturnValue(false);
    mockGetActiveUserId.mockReturnValue('1');
    mockGetCredentials.mockResolvedValue({ token: 'token-1' });
    mockGetUserEmail.mockImplementation((userId: string) =>
      userId === '1' ? 'one@example.com' : 'two@example.com',
    );
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
  });

  it('uses the captured account email/token and verifies response id', async () => {
    mockGetUserByEmail.mockResolvedValue({
      id: 1,
      email: 'one@example.com',
      orgGrants: [],
    });

    await refreshUserOrgGrants('1', 'token-1');

    expect(mockGetUserByEmail).toHaveBeenCalledWith(
      'one@example.com',
      'token-1',
    );
    expect(getUserOrgGrants('1')).toEqual({ status: 'known', grants: [] });
    expect(mockGetActiveUserId).not.toHaveBeenCalledWith('2');
  });

  it('does not fabricate empty grants on network failure', async () => {
    mockGetUserByEmail.mockRejectedValue(new Error('Network timeout'));

    await refreshUserOrgGrants('1', 'token-1');

    expect(getUserOrgGrants('1')).toEqual({
      status: 'known',
      grants: [observerGrant],
    });
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
  });

  it('marks unknown and sets reauth on auth failure', async () => {
    mockGetUserByEmail.mockRejectedValue(new AuthError('revoked'));

    await expect(refreshUserOrgGrants('1', 'token-1')).rejects.toThrow(
      AuthError,
    );

    expect(mockStore.get('1:org_grant_snapshot')).toBe(
      JSON.stringify({ status: 'unknown' }),
    );
    expect(mockSetReauthRequired).toHaveBeenCalledWith('1');
    expect(mockEmitAuthReauthRequired).toHaveBeenCalledWith('1');
  });

  it('marks unknown on response user-id mismatch', async () => {
    mockGetUserByEmail.mockResolvedValue({
      id: 2,
      email: 'two@example.com',
      orgGrants: [observerGrant],
    });

    await refreshUserOrgGrants('1', 'token-1');

    expect(getUserOrgGrants('1')).toEqual({ status: 'unknown' });
  });

  it('does not switch active account during refresh', async () => {
    mockGetActiveUserId.mockReturnValue('2');
    mockGetUserByEmail.mockResolvedValue({
      id: 1,
      email: 'one@example.com',
      orgGrants: [],
    });

    await refreshUserOrgGrants('1', 'token-1');

    expect(mockGetUserByEmail).toHaveBeenCalledWith(
      'one@example.com',
      'token-1',
    );
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();
  });

  it('discards deferred success after logout clear', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    mockGetUserByEmail.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve;
      }),
    );

    const pending = refreshUserOrgGrants('1', 'token-1');
    clearUserOrgGrantSnapshot('1');
    mockGetKnownUserIds.mockReturnValue(['2']);
    resolveFetch({
      id: 1,
      email: 'one@example.com',
      orgGrants: [],
    });
    await pending;

    expect(mockStore.has('1:org_grant_snapshot')).toBe(false);
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
  });

  it('discards deferred success after credential replacement', async () => {
    let resolveFetch: (value: unknown) => void = () => undefined;
    mockGetUserByEmail.mockReturnValue(
      new Promise(resolve => {
        resolveFetch = resolve;
      }),
    );

    const pending = refreshUserOrgGrants('1', 'token-1');
    mockGetCredentials.mockResolvedValue({ token: 'token-2' });
    resolveFetch({
      id: 1,
      email: 'one@example.com',
      orgGrants: [],
    });
    await pending;

    expect(getUserOrgGrants('1')).toEqual({
      status: 'known',
      grants: [observerGrant],
    });
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
  });

  it('does not mark reauth when late 401 arrives after credential replacement', async () => {
    let rejectFetch: (reason?: unknown) => void = () => undefined;
    mockGetUserByEmail.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      }),
    );

    const pending = refreshUserOrgGrants('1', 'token-1');
    mockGetCredentials.mockResolvedValue({ token: 'token-2' });
    rejectFetch(new AuthError('revoked'));
    await pending;

    expect(getUserOrgGrants('1')).toEqual({
      status: 'known',
      grants: [observerGrant],
    });
    expect(mockSetReauthRequired).not.toHaveBeenCalled();
    expect(mockEmitAuthReauthRequired).not.toHaveBeenCalled();
  });

  it('discards older overlapping refresh when a newer refresh completes', async () => {
    let resolveOlder: (value: unknown) => void = () => undefined;
    let resolveNewer: (value: unknown) => void = () => undefined;
    mockGetUserByEmail
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveOlder = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveNewer = resolve;
        }),
      );

    const older = refreshUserOrgGrants('1', 'token-1');
    const newer = refreshUserOrgGrants('1', 'token-1');

    resolveOlder({
      id: 1,
      email: 'one@example.com',
      orgGrants: [],
    });
    await older;

    expect(getUserOrgGrants('1')).toEqual({
      status: 'known',
      grants: [observerGrant],
    });

    resolveNewer({
      id: 1,
      email: 'one@example.com',
      orgGrants: [translatorGrant],
    });
    await newer;

    expect(getUserOrgGrants('1')).toEqual({
      status: 'known',
      grants: [translatorGrant],
    });
  });
});

describe('markUserOrgGrantsUnknown', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    mockGetKnownUserIds.mockReturnValue(['1']);
    mockIsReauthRequired.mockReturnValue(false);
  });

  it('clears positives without writing a known-empty revoked snapshot', () => {
    persistOrgGrantsFromUserResponse('1', {
      id: 1,
      email: 'one@example.com',
      orgGrants: [observerGrant],
    });
    markUserOrgGrantsUnknown('1');
    expect(getUserOrgGrants('1')).toEqual({ status: 'unknown' });
  });
});
