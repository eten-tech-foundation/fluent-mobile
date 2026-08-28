import { ApiUser } from '../types/api/responses';
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
  registerKnownUser,
  setUserSync,
  switchActiveUser,
  clearReauthRequired,
} from './storage';
import { emitAuthReauthResolved } from './syncEvents';

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
  if (!legacyEmail) {
    log.info('Clearing temp credentials without legacy email marker');
    await clearTempCredentials();
    return { authenticated: false };
  }

  const knownUserIds = (await getAllStoredUserIds()) ?? [];

  for (const userId of knownUserIds) {
    if (getUserEmail(userId) !== legacyEmail) {
      continue;
    }
    log.info('Restoring session from temp credentials', {
      userId,
      legacyEmail,
    });
    authToken.set(tempCreds.token);
    await saveCredentials(tempCreds.token, userId);
    if (userId !== getActiveUserId()) {
      switchActiveUser(userId);
    }
    await clearTempCredentials();
    return { authenticated: true, userId };
  }

  log.info('Clearing orphan temp credentials without persisted user');
  await clearTempCredentials();
  kvStorage.removeItemSync(KV_KEYS.USER_EMAIL);
  return { authenticated: false };
}

/** Restores an in-memory session from secure storage and KV active user. */
export async function restoreSession(): Promise<SessionRestoreResult> {
  const tempResult = await tryRestoreFromTempCredentials();
  if (tempResult.authenticated) {
    return tempResult;
  }

  const activeUserId = getActiveUserId();

  if (activeUserId) {
    const activeResult = await tryRestoreUser(activeUserId);
    if (activeResult.authenticated) {
      return activeResult;
    }
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

/** Clears the soft-reauth flag and notifies UI listeners (Home banner, Settings). */
export function resolveReauthForUser(userId: string): void {
  clearReauthRequired(userId);
  emitAuthReauthResolved(userId);
}

/** Persists credentials and sets the in-memory token after a successful sign-in. */
export async function beginLoginSession(
  token: string,
  email: string,
): Promise<ApiUser> {
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
  resolveReauthForUser(userId);
  await clearTempCredentials();

  log.info('Login session persisted before sync', { userId, email });
  return user;
}

/** Persists a new device account without changing the active in-memory session. */
export async function beginAddAccountSession(
  token: string,
  email: string,
): Promise<ApiUser> {
  const user = await FluentAPI.getUserByEmail(email, token);
  if (!user?.id) {
    throw new Error('Invalid user response');
  }

  const userId = String(user.id);
  await saveCredentials(token, userId);
  registerKnownUser(userId, email);
  resolveReauthForUser(userId);

  return user;
}
