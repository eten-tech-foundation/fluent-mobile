jest.mock('./authToken', () => ({
  authToken: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('./api', () => ({
  FluentAPI: {
    getUserByEmail: jest.fn(),
  },
}));

jest.mock('./keychain', () => ({
  hasCredentials: jest.fn(),
  getCredentials: jest.fn(),
  getTempCredentials: jest.fn().mockResolvedValue(null),
  getAllStoredUserIds: jest.fn(),
  saveTempCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  clearTempCredentials: jest.fn(),
}));

jest.mock('./syncEvents', () => ({
  emitAuthReauthResolved: jest.fn(),
}));

jest.mock('./storage', () => ({
  getActiveUserId: jest.fn(),
  getUserEmail: jest.fn(),
  switchActiveUser: jest.fn(),
  clearUserSession: jest.fn(),
  setUserSync: jest.fn(),
  registerKnownUser: jest.fn(),
  clearReauthRequired: jest.fn(),
  KV_KEYS: {
    ACTIVE_USER_ID: 'active_user_id',
    USER_EMAIL: 'userEmail',
  },
  kvStorage: {
    removeItemSync: jest.fn(),
    setItemSync: jest.fn(),
    getItemSync: jest.fn(),
  },
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';
import {
  clearTempCredentials,
  getAllStoredUserIds,
  getCredentials,
  getTempCredentials,
  hasCredentials,
  saveCredentials,
  saveTempCredentials,
} from './keychain';
import {
  clearUserSession,
  getActiveUserId,
  getUserEmail,
  kvStorage,
  KV_KEYS,
  setUserSync,
  registerKnownUser,
  switchActiveUser,
  clearReauthRequired,
} from './storage';
import { emitAuthReauthResolved } from './syncEvents';
import {
  restoreSession,
  signOut,
  beginLoginSession,
  beginAddAccountSession,
  resolveReauthForUser,
} from './authSession';

describe('restoreSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getTempCredentials).mockResolvedValue(null);
    jest.mocked(kvStorage.getItemSync).mockReturnValue(undefined);
  });

  it('restores the active user when credentials exist', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('2');
    jest.mocked(getAllStoredUserIds).mockResolvedValue(['2']);
    jest.mocked(hasCredentials).mockResolvedValue(true);
    jest.mocked(getCredentials).mockResolvedValue({ token: 'active-token' });

    await expect(restoreSession()).resolves.toEqual({
      authenticated: true,
      userId: '2',
    });
    expect(authToken.set).toHaveBeenCalledWith('active-token');
    expect(switchActiveUser).not.toHaveBeenCalled();
  });

  it('does not authenticate as another known user when active credentials are missing', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('1');
    jest.mocked(getAllStoredUserIds).mockResolvedValue(['1', '2']);
    jest
      .mocked(hasCredentials)
      .mockImplementation(async userId => userId === '2');
    jest
      .mocked(getCredentials)
      .mockImplementation(async userId =>
        userId === '2' ? { token: 'user-2-token' } : null,
      );

    await expect(restoreSession()).resolves.toEqual({
      authenticated: false,
    });
    expect(switchActiveUser).not.toHaveBeenCalled();
    expect(authToken.set).toHaveBeenCalledWith(null);
  });

  it('does not fall back to another known user when active user id is empty', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('');
    jest.mocked(getAllStoredUserIds).mockResolvedValue(['2']);
    jest
      .mocked(hasCredentials)
      .mockImplementation(async userId => userId === '2');
    jest.mocked(getCredentials).mockResolvedValue({ token: 'user-2-token' });

    await expect(restoreSession()).resolves.toEqual({
      authenticated: false,
    });
    expect(switchActiveUser).not.toHaveBeenCalled();
    expect(authToken.set).toHaveBeenCalledWith(null);
  });

  it('does not switch to another known user when temp creds exist without legacy email', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('');
    jest.mocked(getAllStoredUserIds).mockResolvedValue(['1', '2']);
    jest.mocked(getTempCredentials).mockResolvedValue({ token: 'temp-token' });
    jest.mocked(kvStorage.getItemSync).mockReturnValue(undefined);
    jest
      .mocked(hasCredentials)
      .mockImplementation(async userId => userId === '1' || userId === '2');
    jest
      .mocked(getCredentials)
      .mockImplementation(async userId =>
        userId === '1' ? { token: 'user-1-token' } : { token: 'user-2-token' },
      );

    await expect(restoreSession()).resolves.toEqual({
      authenticated: false,
    });
    expect(switchActiveUser).not.toHaveBeenCalled();
    expect(clearTempCredentials).toHaveBeenCalled();
    expect(authToken.set).toHaveBeenCalledWith(null);
  });

  it('clears orphan temp credentials instead of opening a session without a user', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('');
    jest.mocked(getAllStoredUserIds).mockResolvedValue([]);
    jest.mocked(getTempCredentials).mockResolvedValue({ token: 'temp-token' });
    jest
      .mocked(kvStorage.getItemSync)
      .mockImplementation(key =>
        key === KV_KEYS.USER_EMAIL ? 't@fluent.local' : undefined,
      );

    await expect(restoreSession()).resolves.toEqual({
      authenticated: false,
    });
    expect(clearTempCredentials).toHaveBeenCalled();
    expect(kvStorage.removeItemSync).toHaveBeenCalledWith(KV_KEYS.USER_EMAIL);
    expect(authToken.set).toHaveBeenCalledWith(null);
  });

  it('restores persisted credentials after login before sync when sync never ran', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('42');
    jest.mocked(getAllStoredUserIds).mockResolvedValue(['42']);
    jest.mocked(hasCredentials).mockResolvedValue(true);
    jest.mocked(getCredentials).mockResolvedValue({ token: 'persisted-token' });

    await expect(restoreSession()).resolves.toEqual({
      authenticated: true,
      userId: '42',
    });
    expect(authToken.set).toHaveBeenCalledWith('persisted-token');
  });

  it('restores with the temp token when permanent credentials are stale', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('42');
    jest.mocked(getAllStoredUserIds).mockResolvedValue(['42']);
    jest.mocked(getTempCredentials).mockResolvedValue({
      token: 'fresh-temp-token',
    });
    jest
      .mocked(kvStorage.getItemSync)
      .mockImplementation(key =>
        key === KV_KEYS.USER_EMAIL ? 't@fluent.local' : undefined,
      );
    jest.mocked(getUserEmail).mockReturnValue('t@fluent.local');

    await expect(restoreSession()).resolves.toEqual({
      authenticated: true,
      userId: '42',
    });

    expect(authToken.set).toHaveBeenCalledWith('fresh-temp-token');
    expect(saveCredentials).toHaveBeenCalledWith('fresh-temp-token', '42');
    expect(clearTempCredentials).toHaveBeenCalled();
    expect(authToken.set).not.toHaveBeenCalledWith('stale-permanent-token');
  });

  it('returns unauthenticated when no credentials are available', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('9');
    jest.mocked(getAllStoredUserIds).mockResolvedValue(['9']);
    jest.mocked(hasCredentials).mockResolvedValue(false);

    await expect(restoreSession()).resolves.toEqual({
      authenticated: false,
    });
    expect(authToken.set).toHaveBeenCalledWith(null);
  });
});

describe('beginLoginSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists credentials and KV active user before post-login sync', async () => {
    jest.mocked(FluentAPI.getUserByEmail).mockResolvedValue({
      id: 42,
      email: 't@fluent.local',
    });

    await expect(
      beginLoginSession('session-token', 't@fluent.local'),
    ).resolves.toEqual({
      id: 42,
      email: 't@fluent.local',
    });

    expect(saveTempCredentials).toHaveBeenCalledWith('session-token');
    expect(authToken.set).toHaveBeenCalledWith('session-token');
    expect(kvStorage.setItemSync).toHaveBeenCalledWith(
      KV_KEYS.USER_EMAIL,
      't@fluent.local',
    );
    expect(FluentAPI.getUserByEmail).toHaveBeenCalledWith('t@fluent.local');
    expect(saveCredentials).toHaveBeenCalledWith('session-token', '42');
    expect(setUserSync).toHaveBeenCalledWith('42', 't@fluent.local');
    expect(clearReauthRequired).toHaveBeenCalledWith('42');
    expect(emitAuthReauthResolved).toHaveBeenCalledWith('42');
    expect(clearTempCredentials).toHaveBeenCalled();
  });
});

describe('beginAddAccountSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists credentials without changing auth token or active user', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('245');
    jest.mocked(FluentAPI.getUserByEmail).mockResolvedValue({
      id: 247,
      email: 'b@example.com',
    });

    await expect(
      beginAddAccountSession('b-token', 'b@example.com'),
    ).resolves.toEqual({
      id: 247,
      email: 'b@example.com',
    });

    expect(saveCredentials).toHaveBeenCalledWith('b-token', '247');
    expect(FluentAPI.getUserByEmail).toHaveBeenCalledWith(
      'b@example.com',
      'b-token',
    );
    expect(registerKnownUser).toHaveBeenCalledWith('247', 'b@example.com');
    expect(clearReauthRequired).toHaveBeenCalledWith('247');
    expect(emitAuthReauthResolved).toHaveBeenCalledWith('247');
    expect(saveTempCredentials).not.toHaveBeenCalled();
    expect(authToken.set).not.toHaveBeenCalled();
    expect(setUserSync).not.toHaveBeenCalled();
    expect(kvStorage.setItemSync).not.toHaveBeenCalled();
  });
});

describe('resolveReauthForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the KV flag and notifies listeners', () => {
    resolveReauthForUser('7');

    expect(clearReauthRequired).toHaveBeenCalledWith('7');
    expect(emitAuthReauthResolved).toHaveBeenCalledWith('7');
  });
});

describe('signOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears the active token and KV session keys', () => {
    signOut();

    expect(authToken.set).toHaveBeenCalledWith(null);
    expect(kvStorage.removeItemSync).toHaveBeenCalledWith(
      KV_KEYS.ACTIVE_USER_ID,
    );
    expect(clearUserSession).toHaveBeenCalled();
  });
});
