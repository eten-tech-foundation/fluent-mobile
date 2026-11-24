jest.mock('./storage', () => ({
  getKnownUserIds: () => mockAccounts.ids,
  getUserEmail: (userId: string) => mockAccounts.emails[userId] ?? '',
  getPendingVerifierCleanupUserIds: () => [...mockPendingCleanup],
  setVerifierCleanupPending: (userId: string, pending: boolean) => {
    if (pending) mockPendingCleanup.add(userId);
    else mockPendingCleanup.delete(userId);
  },
}));

const mockPendingCleanup = new Set<string>();

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
}));

import { getRandomBytesAsync } from 'expo-crypto';
import { resetSecureStoreMock } from '../test/mocks/expo-secure-store';
import {
  clearCredentials,
  getPasswordVerifierRecord,
  saveCredentials,
  savePasswordVerifierRecord,
} from './keychain';
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
      .mocked(getRandomBytesAsync)
      .mockImplementation(async count =>
        Uint8Array.from({ length: count }, (_, index) => index * 17),
      );
    resetSecureStoreMock();
    mockPendingCleanup.clear();
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
      await savePasswordVerifier('7', 'correct horse', 'stored-token', {
        iterations: 4,
      });
      expect(getRandomBytesAsync).toHaveBeenCalledWith(16);
      const record = JSON.parse((await getPasswordVerifierRecord('7')) ?? '{}');
      expect(record.salt).toBe('00112233445566778899aabbccddeeff');
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
    jest
      .mocked(getRandomBytesAsync)
      .mockRejectedValueOnce(new Error('Native random source unavailable'));
    await expect(
      savePasswordVerifier('7', 'correct horse', 'stored-token'),
    ).rejects.toThrow('Native random source unavailable');
    expect(await getPasswordVerifierRecord('7')).toBeNull();
  });

  it('does not let an older verifier unlock a newer token when the replacement fails', async () => {
    await savePasswordVerifier('7', 'old password', 'stored-token', {
      iterations: 4,
    });
    await saveCredentials('new-token', '7');
    jest
      .mocked(getRandomBytesAsync)
      .mockRejectedValueOnce(new Error('Native random source unavailable'));
    await expect(
      savePasswordVerifier('7', 'new password', 'new-token', {
        iterations: 4,
      }),
    ).rejects.toThrow('Native random source unavailable');

    await expect(
      restoreOfflineSession('person@example.com', 'old password'),
    ).resolves.toEqual({ ok: false, reason: 'no-verifier' });
    await expect(
      restoreOfflineSession('person@example.com', 'new password'),
    ).resolves.toEqual({ ok: false, reason: 'no-verifier' });
  });

  it('accepts only the new password once the replacement is saved', async () => {
    await savePasswordVerifier('7', 'old password', 'stored-token', {
      iterations: 4,
    });
    await saveCredentials('new-token', '7');
    await savePasswordVerifier('7', 'new password', 'new-token', {
      iterations: 4,
    });

    await expect(
      restoreOfflineSession('person@example.com', 'new password'),
    ).resolves.toEqual({ ok: true, userId: '7' });
    await expect(
      restoreOfflineSession('person@example.com', 'old password'),
    ).resolves.toEqual({ ok: false, reason: 'mismatch' });
  });

  it('does not write a verifier when the account is removed during the hash', async () => {
    let releaseRandom: () => void = () => {};
    let markRequested: () => void = () => {};
    const randomRequested = new Promise<void>(resolve => {
      markRequested = resolve;
    });
    jest.mocked(getRandomBytesAsync).mockImplementationOnce(
      count =>
        new Promise(resolve => {
          releaseRandom = () => resolve(new Uint8Array(count));
          markRequested();
        }),
    );
    const saving = savePasswordVerifier('7', 'correct horse', 'stored-token', {
      iterations: 4,
    });
    await randomRequested;
    await clearCredentials('7');
    releaseRandom();
    await saving;

    expect(await getPasswordVerifierRecord('7')).toBeNull();
  });

  it('finishes a cleanup an earlier account removal left behind', async () => {
    await savePasswordVerifierRecord('9', '{"v":2}');
    mockPendingCleanup.add('9');

    await savePasswordVerifier('7', 'correct horse', 'stored-token', {
      iterations: 4,
    });

    expect(await getPasswordVerifierRecord('9')).toBeNull();
    expect(mockPendingCleanup.size).toBe(0);
  });

  it('stores the production iteration count', async () => {
    await savePasswordVerifier('7', 'correct horse', 'stored-token');
    const raw = await getPasswordVerifierRecord('7');
    expect(JSON.parse(raw ?? '{}').c).toBe(PASSWORD_VERIFIER_ITERATIONS);
  });

  it('accepts the password that was saved and rejects a different one', async () => {
    await savePasswordVerifier('7', 'correct horse', 'stored-token', {
      iterations: 4,
    });

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
    await savePasswordVerifier('7', 'correct horse', 'stored-token', {
      iterations: 4,
    });
    await clearCredentials('7');

    await expect(
      restoreOfflineSession('person@example.com', 'correct horse'),
    ).resolves.toEqual({ ok: false, reason: 'no-token' });
  });

  it('locks out after five mismatches and allows a later correct password', async () => {
    await savePasswordVerifier('7', 'correct horse', 'stored-token', {
      iterations: 4,
    });
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
