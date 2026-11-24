const mockPendingCleanup = new Set<string>();

jest.mock('./storage', () => ({
  getKnownUserIds: jest.fn(() => ['1', '2']),
  getPendingVerifierCleanupUserIds: () => [...mockPendingCleanup],
  setVerifierCleanupPending: (userId: string, pending: boolean) => {
    if (pending) mockPendingCleanup.add(userId);
    else mockPendingCleanup.delete(userId);
  },
}));

import {
  clearCredentials,
  clearTempCredentials,
  getAllStoredUserIds,
  getCredentials,
  getCredentialsVersion,
  getPasswordVerifierRecord,
  getTempCredentials,
  hasCredentials,
  retryPendingVerifierCleanup,
  saveCredentials,
  savePasswordVerifierRecord,
  saveTempCredentials,
} from './keychain';
import * as SecureStore from 'expo-secure-store';
import { resetSecureStoreMock } from '../test/mocks/expo-secure-store';

describe('keychain (expo-secure-store)', () => {
  beforeEach(() => {
    resetSecureStoreMock();
    mockPendingCleanup.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('saves and reads temp credentials', async () => {
    await saveTempCredentials('temp-token');
    await expect(getTempCredentials()).resolves.toEqual({
      token: 'temp-token',
    });
    await clearTempCredentials();
    await expect(getTempCredentials()).resolves.toBeNull();
  });

  it('moves the credentials version on every save and clear, even when SecureStore fails', async () => {
    const start = getCredentialsVersion();
    const saving = saveCredentials('token-a', '1');
    expect(getCredentialsVersion()).toBeGreaterThan(start);
    await saving;
    const saved = getCredentialsVersion();
    await getCredentials('1');
    expect(getCredentialsVersion()).toBe(saved);

    await clearCredentials('1');
    const cleared = getCredentialsVersion();
    expect(cleared).toBeGreaterThan(saved);

    jest
      .spyOn(SecureStore, 'setItemAsync')
      .mockRejectedValueOnce(new Error('keystore unavailable'));
    await expect(saveCredentials('token-b', '1')).rejects.toThrow(
      'keystore unavailable',
    );
    expect(getCredentialsVersion()).toBeGreaterThan(cleared);
  });

  it('isolates credentials per userId', async () => {
    await saveCredentials('token-a', '1');
    await saveCredentials('token-b', '2');

    await expect(getCredentials('1')).resolves.toEqual({ token: 'token-a' });
    await expect(getCredentials('2')).resolves.toEqual({ token: 'token-b' });
    await expect(hasCredentials('1')).resolves.toBe(true);
    await expect(hasCredentials('99')).resolves.toBe(false);
  });

  it('clears credentials for a user', async () => {
    await saveCredentials('token-a', '1');
    await clearCredentials('1');
    await expect(getCredentials('1')).resolves.toBeNull();
    await expect(hasCredentials('1')).resolves.toBe(false);
  });

  it('clears the password verifier with the credentials', async () => {
    await saveCredentials('token-a', '1');
    await savePasswordVerifierRecord('1', '{"v":2}');

    await expect(clearCredentials('1')).resolves.toEqual({
      verifierCleared: true,
    });
    await expect(getPasswordVerifierRecord('1')).resolves.toBeNull();
    expect(mockPendingCleanup.size).toBe(0);
  });

  it('treats a failed delete of an already-missing verifier as cleared', async () => {
    await saveCredentials('token-a', '1');
    const realDelete = SecureStore.deleteItemAsync;
    jest.spyOn(SecureStore, 'deleteItemAsync').mockImplementation(async key => {
      if (key.includes('.verifier.')) throw new Error('not found');
      return realDelete(key);
    });

    await expect(clearCredentials('1')).resolves.toEqual({
      verifierCleared: true,
    });
    await expect(getCredentials('1')).resolves.toBeNull();
    expect(mockPendingCleanup.size).toBe(0);
  });

  it('reports a verifier that could not be deleted, still deletes the token, and retries later', async () => {
    await saveCredentials('token-a', '1');
    await savePasswordVerifierRecord('1', '{"v":2}');
    const realDelete = SecureStore.deleteItemAsync;
    const deleteSpy = jest
      .spyOn(SecureStore, 'deleteItemAsync')
      .mockImplementation(async key => {
        if (key.includes('.verifier.')) throw new Error('keystore locked');
        return realDelete(key);
      });

    await expect(clearCredentials('1')).resolves.toEqual({
      verifierCleared: false,
    });
    await expect(getCredentials('1')).resolves.toBeNull();
    await expect(getPasswordVerifierRecord('1')).resolves.not.toBeNull();
    expect([...mockPendingCleanup]).toEqual(['1']);

    deleteSpy.mockRestore();
    await retryPendingVerifierCleanup();
    await expect(getPasswordVerifierRecord('1')).resolves.toBeNull();
    expect(mockPendingCleanup.size).toBe(0);
  });

  it('retries a queued cleanup when another account is removed', async () => {
    await savePasswordVerifierRecord('1', '{"v":2}');
    mockPendingCleanup.add('1');
    await saveCredentials('token-b', '2');

    await clearCredentials('2');

    await expect(getPasswordVerifierRecord('1')).resolves.toBeNull();
    expect(mockPendingCleanup.size).toBe(0);
  });

  it('does not let a queued cleanup delete a verifier saved afterwards', async () => {
    mockPendingCleanup.add('1');
    await savePasswordVerifierRecord('1', '{"v":2}');

    await retryPendingVerifierCleanup();
    await expect(getPasswordVerifierRecord('1')).resolves.toBe('{"v":2}');
  });

  it('returns known user IDs from the KV index', async () => {
    await expect(getAllStoredUserIds()).resolves.toEqual(['1', '2']);
  });
});
