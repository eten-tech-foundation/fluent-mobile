jest.mock('./storage', () => ({
  getKnownUserIds: () => mockAccounts.ids,
  getUserEmail: (userId: string) => mockAccounts.emails[userId] ?? '',
}));

import { uuid } from 'expo-modules-core';
import { resetSecureStoreMock } from '../test/mocks/expo-secure-store';
import { clearCredentials, saveCredentials } from './keychain';
import { getPasswordVerifierRecord } from './keychain';
import {
  PASSWORD_VERIFIER_ITERATIONS,
  resetOfflineSignInAttempts,
  restoreOfflineSession,
  savePasswordVerifier,
} from './passwordVerifier';

const mockAccounts: {
  ids: string[];
  emails: Record<string, string>;
} = {
  ids: ['7'],
  emails: { '7': 'person@example.com' },
};

describe('passwordVerifier', () => {
  beforeEach(async () => {
    jest
      .spyOn(uuid, 'v4')
      .mockReturnValue('00112233-4455-4677-8899-aabbccddeeff');
    resetSecureStoreMock();
    resetOfflineSignInAttempts();
    mockAccounts.ids = ['7'];
    mockAccounts.emails = { '7': 'person@example.com' };
    await saveCredentials('stored-token', '7');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saves and checks a verifier without Web Crypto on the native runtime', async () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'crypto',
    );
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });
    try {
      await savePasswordVerifier('7', 'correct horse', { iterations: 4 });
      expect(uuid.v4).toHaveBeenCalledTimes(1);
      const record = JSON.parse((await getPasswordVerifierRecord('7')) ?? '{}');
      expect(record.salt).toBe('00112233445546778899aabbccddeeff');
      await expect(
        restoreOfflineSession('person@example.com', 'correct horse'),
      ).resolves.toEqual({ ok: true, userId: '7' });
      await expect(
        restoreOfflineSession('person@example.com', 'wrong'),
      ).resolves.toEqual({ ok: false, reason: 'mismatch' });
    } finally {
      if (cryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'crypto');
      }
    }
  });

  it('does not save a verifier if native randomness fails', async () => {
    jest.mocked(uuid.v4).mockImplementationOnce(() => {
      throw new Error('Native random source unavailable');
    });
    await expect(savePasswordVerifier('7', 'correct horse')).rejects.toThrow(
      'Native random source unavailable',
    );
    expect(await getPasswordVerifierRecord('7')).toBeNull();
  });

  it('stores the production iteration count', async () => {
    await savePasswordVerifier('7', 'correct horse');
    const raw = await getPasswordVerifierRecord('7');
    expect(JSON.parse(raw ?? '{}').c).toBe(PASSWORD_VERIFIER_ITERATIONS);
  });

  it('accepts the password that was saved and rejects a different one', async () => {
    await savePasswordVerifier('7', 'correct horse', { iterations: 4 });

    await expect(
      restoreOfflineSession('Person@Example.com', 'correct horse'),
    ).resolves.toEqual({ ok: true, userId: '7' });

    await expect(
      restoreOfflineSession('person@example.com', 'wrong'),
    ).resolves.toEqual({ ok: false, reason: 'mismatch' });
    await expect(
      restoreOfflineSession('person@example.com', 'correct horse'),
    ).resolves.toEqual({ ok: true, userId: '7' });
  });

  it('reports no verifier when this device has never signed in online', async () => {
    await expect(
      restoreOfflineSession('person@example.com', 'correct horse'),
    ).resolves.toEqual({ ok: false, reason: 'no-verifier' });
  });

  it('reports no token when the account was removed from the device', async () => {
    await savePasswordVerifier('7', 'correct horse', { iterations: 4 });
    await clearCredentials('7');

    await expect(
      restoreOfflineSession('person@example.com', 'correct horse'),
    ).resolves.toEqual({ ok: false, reason: 'no-token' });
  });

  it('locks out after five mismatches and allows a later correct password', async () => {
    await savePasswordVerifier('7', 'correct horse', { iterations: 4 });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        restoreOfflineSession('person@example.com', 'wrong'),
      ).resolves.toEqual({ ok: false, reason: 'mismatch' });
    }

    await expect(
      restoreOfflineSession('person@example.com', 'correct horse'),
    ).resolves.toEqual({ ok: false, reason: 'locked' });

    now.mockReturnValue(1_000_000 + 60_000);
    await expect(
      restoreOfflineSession('person@example.com', 'correct horse'),
    ).resolves.toEqual({ ok: true, userId: '7' });
    now.mockRestore();
  });
});
