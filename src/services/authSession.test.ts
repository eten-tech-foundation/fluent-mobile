jest.mock('./authToken', () => ({
  authToken: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('./keychain', () => ({
  hasCredentials: jest.fn(),
  getCredentials: jest.fn(),
  getAllStoredUserIds: jest.fn(),
  saveTempCredentials: jest.fn(),
}));

jest.mock('./storage', () => ({
  getActiveUserId: jest.fn(),
  switchActiveUser: jest.fn(),
  clearUserSession: jest.fn(),
  KV_KEYS: {
    ACTIVE_USER_ID: 'active_user_id',
    USER_EMAIL: 'userEmail',
  },
  kvStorage: {
    removeItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

import { authToken } from './authToken';
import {
  getAllStoredUserIds,
  getCredentials,
  hasCredentials,
  saveTempCredentials,
} from './keychain';
import {
  clearUserSession,
  getActiveUserId,
  kvStorage,
  KV_KEYS,
  switchActiveUser,
} from './storage';
import { restoreSession, signOut, beginLoginSession } from './authSession';

describe('restoreSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores the active user when credentials exist', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('2');
    jest.mocked(hasCredentials).mockResolvedValue(true);
    jest.mocked(getCredentials).mockResolvedValue({ token: 'active-token' });

    await expect(restoreSession()).resolves.toEqual({
      authenticated: true,
      userId: '2',
    });
    expect(authToken.set).toHaveBeenCalledWith('active-token');
    expect(switchActiveUser).not.toHaveBeenCalled();
  });

  it('falls back to the first known user with credentials', async () => {
    jest.mocked(getActiveUserId).mockReturnValue('');
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
      authenticated: true,
      userId: '2',
    });
    expect(switchActiveUser).toHaveBeenCalledWith('2');
    expect(authToken.set).toHaveBeenCalledWith('user-2-token');
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

  it('stores temp credentials, sets the token, and records the email', async () => {
    await beginLoginSession('session-token', 't@fluent.local');

    expect(saveTempCredentials).toHaveBeenCalledWith('session-token');
    expect(authToken.set).toHaveBeenCalledWith('session-token');
    expect(kvStorage.setItemSync).toHaveBeenCalledWith(
      KV_KEYS.USER_EMAIL,
      't@fluent.local',
    );
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
