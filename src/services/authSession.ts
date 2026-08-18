import { logger } from '../utils/logger';
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
  switchActiveUser,
} from './storage';

const log = logger.create('AuthSession');

export interface SessionRestoreResult {
  authenticated: boolean;
  userId?: string;
}

async function tryRestoreUser(userId: string): Promise<SessionRestoreResult> {
  const hasToken = await hasCredentials(userId);
  if (!hasToken) {
    return { authenticated: false };
  }

  const creds = await getCredentials(userId);
  if (!creds?.token) {
    return { authenticated: false };
  }

  authToken.set(creds.token);
  return { authenticated: true, userId };
}

async function tryRestoreFromTempCredentials(): Promise<SessionRestoreResult> {
  const tempCreds = await getTempCredentials();
  if (!tempCreds?.token) {
    return { authenticated: false };
  }

  const legacyEmail = kvStorage.getItemSync(KV_KEYS.USER_EMAIL) ?? '';
  const knownUserIds = (await getAllStoredUserIds()) ?? [];

  for (const userId of knownUserIds) {
    if (legacyEmail && getUserEmail(userId) !== legacyEmail) {
      continue;
    }
    const restored = await tryRestoreUser(userId);
    if (restored.authenticated) {
      if (userId !== getActiveUserId()) {
        switchActiveUser(userId);
      }
      await clearTempCredentials();
      return restored;
    }
  }

  log.info('Clearing orphan temp credentials without persisted user');
  await clearTempCredentials();
  kvStorage.removeItemSync(KV_KEYS.USER_EMAIL);
  return { authenticated: false };
}

/** Restores an in-memory session from secure storage and KV active user. */
export async function restoreSession(): Promise<SessionRestoreResult> {
  const activeUserId = getActiveUserId();
  const knownUserIds = (await getAllStoredUserIds()) ?? [];

  if (activeUserId) {
    const activeResult = await tryRestoreUser(activeUserId);
    if (activeResult.authenticated) {
      return activeResult;
    }
  }

  for (const userId of knownUserIds) {
    if (userId === activeUserId) {
      continue;
    }
    const restored = await tryRestoreUser(userId);
    if (restored.authenticated) {
      switchActiveUser(userId);
      return restored;
    }
  }

  const tempResult = await tryRestoreFromTempCredentials();
  if (tempResult.authenticated) {
    return tempResult;
  }

  authToken.set(null);
  return { authenticated: false };
}

/** Clears the active in-memory token and KV session; keeps stored credentials. */
export function signOut(): void {
  authToken.set(null);
  kvStorage.removeItemSync(KV_KEYS.ACTIVE_USER_ID);
  clearUserSession();
}

/** Persists credentials and sets the in-memory token after a successful sign-in. */
export async function beginLoginSession(
  token: string,
  email: string,
): Promise<void> {
  await saveTempCredentials(token);
  authToken.set(token);
  kvStorage.setItemSync(KV_KEYS.USER_EMAIL, email);

  const user = await FluentAPI.getUserByEmail(email);
  if (!user?.id) {
    throw new Error('Invalid user response');
  }

  const userId = String(user.id);
  await saveCredentials(token, userId);
  setUserSync(userId, email);
  await clearTempCredentials();

  log.info('Login session persisted before sync', { userId, email });
}
