jest.mock('./storage', () => ({
  getKnownUserIds: jest.fn(() => ['1', '2']),
}));

import {
  clearCredentials,
  clearTempCredentials,
  getAllStoredUserIds,
  getCredentials,
  getCredentialsVersion,
  getTempCredentials,
  hasCredentials,
  saveCredentials,
  saveTempCredentials,
} from './keychain';
import * as SecureStore from 'expo-secure-store';
import { resetSecureStoreMock } from '../test/mocks/expo-secure-store';

describe('keychain (expo-secure-store)', () => {
  beforeEach(() => {
    resetSecureStoreMock();
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

  it('returns known user IDs from the KV index', async () => {
    await expect(getAllStoredUserIds()).resolves.toEqual(['1', '2']);
  });
});
