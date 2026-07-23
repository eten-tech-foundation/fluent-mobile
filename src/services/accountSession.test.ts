import {
  signOutCurrentDeviceAccount,
  switchToDeviceAccount,
} from './accountSession';

const mockSignOutApi = jest.fn();
jest.mock('./api', () => ({
  FluentAPI: { signOut: (...args: unknown[]) => mockSignOutApi(...args) },
}));

const mockAuthTokenSet = jest.fn();
jest.mock('./authToken', () => ({
  authToken: { set: (...args: unknown[]) => mockAuthTokenSet(...args) },
}));

const mockClearCredentials = jest.fn();
const mockGetCredentials = jest.fn();
jest.mock('./keychain', () => ({
  clearCredentials: (...args: unknown[]) => mockClearCredentials(...args),
  getCredentials: (...args: unknown[]) => mockGetCredentials(...args),
}));

const mockSignOut = jest.fn();
jest.mock('./authSession', () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const mockGetActiveUserId = jest.fn();
const mockGetKnownUserIds = jest.fn();
const mockSetItemSync = jest.fn();
const mockSwitchActiveUser = jest.fn();
jest.mock('./storage', () => ({
  getActiveUserId: (...args: unknown[]) => mockGetActiveUserId(...args),
  getKnownUserIds: (...args: unknown[]) => mockGetKnownUserIds(...args),
  kvStorage: { setItemSync: (...args: unknown[]) => mockSetItemSync(...args) },
  KV_KEYS: { KNOWN_USER_IDS: 'known_user_ids' },
  switchActiveUser: (...args: unknown[]) => mockSwitchActiveUser(...args),
}));

jest.mock('../utils/logger', () => ({
  logger: { create: () => ({ info: jest.fn(), error: jest.fn() }) },
}));

describe('accountSession', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetActiveUserId.mockReturnValue('active-1');
    mockSignOutApi.mockResolvedValue(undefined);
    mockClearCredentials.mockResolvedValue(undefined);
  });

  describe('switchToDeviceAccount', () => {
    it('sets token and switches when credentials are valid', async () => {
      mockGetCredentials.mockResolvedValue({ token: 'tok' });

      await switchToDeviceAccount('other-2');

      expect(mockAuthTokenSet).toHaveBeenCalledWith('tok');
      expect(mockSwitchActiveUser).toHaveBeenCalledWith('other-2');
    });

    it('throws when credentials are missing', async () => {
      mockGetCredentials.mockResolvedValue(null);

      await expect(switchToDeviceAccount('other-2')).rejects.toThrow(
        /No usable stored session/,
      );
      expect(mockSwitchActiveUser).not.toHaveBeenCalled();
    });
  });

  describe('signOutCurrentDeviceAccount', () => {
    it('switches to the next account with a usable token', async () => {
      mockGetKnownUserIds.mockReturnValue(['active-1', 'bad-2', 'good-3']);
      mockGetCredentials
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ token: 'next-token' });

      await expect(signOutCurrentDeviceAccount()).resolves.toEqual({
        kind: 'switched',
        userId: 'good-3',
      });

      expect(mockClearCredentials).toHaveBeenCalledWith('active-1');
      expect(mockSetItemSync).toHaveBeenCalledWith(
        'known_user_ids',
        'bad-2,good-3',
      );
      expect(mockAuthTokenSet).toHaveBeenCalledWith('next-token');
      expect(mockSwitchActiveUser).toHaveBeenCalledWith('good-3');
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('fully signs out when no remaining accounts have a token', async () => {
      mockGetKnownUserIds.mockReturnValue(['active-1']);

      await expect(signOutCurrentDeviceAccount()).resolves.toEqual({
        kind: 'signed_out',
      });

      expect(mockSignOut).toHaveBeenCalled();
    });

    it('continues after server sign-out failure', async () => {
      mockSignOutApi.mockRejectedValue(new Error('network'));
      mockGetKnownUserIds.mockReturnValue(['active-1']);

      await expect(signOutCurrentDeviceAccount()).resolves.toEqual({
        kind: 'signed_out',
      });

      expect(mockClearCredentials).toHaveBeenCalledWith('active-1');
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
