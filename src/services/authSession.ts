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

/** Restores an in-memory session from secure storage and KV active user. */
export async function restoreSession(): Promise<SessionRestoreResult> {
  const activeUserId = getActiveUserId();

  if (activeUserId) {
    const activeResult = await tryRestoreUser(activeUserId);
    if (activeResult.authenticated) {
      return activeResult;
    }
  }

  const storedUserIds = await getAllStoredUserIds();
  for (const userId of storedUserIds) {
    if (userId === activeUserId) {
      continue;
    }
    const restored = await tryRestoreUser(userId);
    if (restored.authenticated) {
      switchActiveUser(userId);
      return restored;
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

/** Persists credentials and sets the in-memory token after a successful sign-in. */
export async function beginLoginSession(
  token: string,
  email: string,
): Promise<void> {
  await saveTempCredentials(token);
  authToken.set(token);
  kvStorage.setItemSync(KV_KEYS.USER_EMAIL, email);
}
