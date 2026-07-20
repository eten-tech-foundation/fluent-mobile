const mockKv = new Map<string, string>();

jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: (key: string) => mockKv.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      mockKv.set(key, value);
    },
    removeItemSync: (key: string) => {
      mockKv.delete(key);
    },
  })),
}));

jest.mock('../utils/logger', () => ({
  logger: { create: () => ({ info: jest.fn(), error: jest.fn() }) },
}));

import {
  addKnownUserId,
  clearUserSession,
  getActiveUserId,
  getKnownUserIds,
  getUserEmail,
  getUserEmailSync,
  KV_KEYS,
  MAX_DEVICE_ACCOUNTS,
  setActiveUserId,
  setUserEmail,
  setUserSync,
  switchActiveUser,
} from './storage';

describe('storage (KV wrapper)', () => {
  beforeEach(() => {
    mockKv.clear();
  });

  describe('active user pointer', () => {
    it('returns an empty string when no active user has been set', () => {
      expect(getActiveUserId()).toBe('');
    });

    it('round-trips the active user id', () => {
      setActiveUserId('42');
      expect(getActiveUserId()).toBe('42');
    });
  });

  describe('known user ids', () => {
    it('returns an empty array when nothing is stored', () => {
      expect(getKnownUserIds()).toEqual([]);
    });

    it('parses a comma-separated list', () => {
      mockKv.set(KV_KEYS.KNOWN_USER_IDS, '1,2,3');
      expect(getKnownUserIds()).toEqual(['1', '2', '3']);
    });

    it('filters out empty entries from a malformed list (e.g. trailing comma)', () => {
      mockKv.set(KV_KEYS.KNOWN_USER_IDS, '1,,2,');
      expect(getKnownUserIds()).toEqual(['1', '2']);
    });

    it('adds a new user id without duplicating an existing one', () => {
      addKnownUserId('1');
      addKnownUserId('2');
      addKnownUserId('1'); // duplicate, should be a no-op

      expect(getKnownUserIds()).toEqual(['1', '2']);
    });

    it('respects MAX_DEVICE_ACCOUNTS as the cap constant used elsewhere', () => {
      // addKnownUserId itself doesn't enforce the cap — callers do — but
      // this locks in the constant's value so a silent change elsewhere
      // (e.g. bumping the cap) is a deliberate, visible edit.
      expect(MAX_DEVICE_ACCOUNTS).toBe(3);
    });
  });

  describe('per-user email', () => {
    it('returns an empty string for an unknown user', () => {
      expect(getUserEmail('99')).toBe('');
    });

    it('stores and retrieves email scoped to a specific user id', () => {
      setUserEmail('1', 'one@example.com');
      setUserEmail('2', 'two@example.com');

      expect(getUserEmail('1')).toBe('one@example.com');
      expect(getUserEmail('2')).toBe('two@example.com');
    });
  });

  describe('getUserEmailSync fallback', () => {
    it('returns the active user email when set', () => {
      setActiveUserId('1');
      setUserEmail('1', 'active@example.com');

      expect(getUserEmailSync()).toBe('active@example.com');
    });

    it('falls back to the legacy USER_EMAIL key when the active user has no scoped email', () => {
      setActiveUserId('1');
      mockKv.set(KV_KEYS.USER_EMAIL, 'legacy@example.com');

      expect(getUserEmailSync()).toBe('legacy@example.com');
    });

    it('falls back to the legacy key when there is no active user at all', () => {
      mockKv.set(KV_KEYS.USER_EMAIL, 'legacy@example.com');

      expect(getUserEmailSync()).toBe('legacy@example.com');
    });
  });

  describe('setUserSync', () => {
    it('sets the active user, adds them to known users, and stores their email', () => {
      setUserSync('1', 'one@example.com');

      expect(getActiveUserId()).toBe('1');
      expect(getKnownUserIds()).toEqual(['1']);
      expect(getUserEmail('1')).toBe('one@example.com');
    });
  });

  describe('switchActiveUser', () => {
    it('updates the active user pointer and legacy USER_ID/USER_EMAIL keys together', () => {
      setUserSync('1', 'one@example.com');
      setUserSync('2', 'two@example.com'); // this also switches active to '2'
      switchActiveUser('1');

      expect(getActiveUserId()).toBe('1');
      expect(mockKv.get(KV_KEYS.USER_ID)).toBe('1');
      expect(mockKv.get(KV_KEYS.USER_EMAIL)).toBe('one@example.com');
    });

    it('does not remove either user from the known users list', () => {
      setUserSync('1', 'one@example.com');
      setUserSync('2', 'two@example.com');
      switchActiveUser('1');

      expect(getKnownUserIds()).toEqual(['1', '2']);
    });

    it('leaves USER_EMAIL empty if the target user has no stored email', () => {
      addKnownUserId('3');
      switchActiveUser('3');

      expect(getActiveUserId()).toBe('3');
      expect(mockKv.get(KV_KEYS.USER_EMAIL)).toBe('');
    });
  });

  describe('clearUserSession', () => {
    it('removes the legacy USER_ID and USER_EMAIL keys', () => {
      mockKv.set(KV_KEYS.USER_ID, '1');
      mockKv.set(KV_KEYS.USER_EMAIL, 'one@example.com');

      clearUserSession();

      expect(mockKv.has(KV_KEYS.USER_ID)).toBe(false);
      expect(mockKv.has(KV_KEYS.USER_EMAIL)).toBe(false);
    });

    it('does not touch the active user pointer or known user ids', () => {
      setUserSync('1', 'one@example.com');

      clearUserSession();

      // clearUserSession only clears the legacy USER_ID/USER_EMAIL keys —
      // ACTIVE_USER_ID and KNOWN_USER_IDS are separate and intentionally
      // untouched, since signOut() (in authSession.ts) is what clears
      // ACTIVE_USER_ID specifically.
      expect(getActiveUserId()).toBe('1');
      expect(getKnownUserIds()).toEqual(['1']);
    });
  });
});
