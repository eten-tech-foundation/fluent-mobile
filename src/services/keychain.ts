import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';
import {
  getKnownUserIds,
  getPendingVerifierCleanupUserIds,
  setVerifierCleanupPending,
} from './storage';

const log = logger.create('Keychain');
const SERVICE_PREFIX = 'fluent.auth';
const TEMP_KEY = SERVICE_PREFIX;

export interface AuthCredentials {
  token: string;
}

let credentialsVersion = 0;

/**
 * Bumped before and after every account-credential write or clear, so a
 * caller holding a token read at an older version knows it may be stale.
 */
export function getCredentialsVersion(): number {
  return credentialsVersion;
}

function storageKey(userId: string): string {
  return `${SERVICE_PREFIX}.${userId}`;
}

function verifierKey(userId: string): string {
  return `${SERVICE_PREFIX}.verifier.${userId}`;
}

function parseCredentials(raw: string): AuthCredentials | null {
  try {
    return JSON.parse(raw) as AuthCredentials;
  } catch {
    return null;
  }
}

export async function saveTempCredentials(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TEMP_KEY, JSON.stringify({ token }));
    log.info('Temp credentials saved');
  } catch (error) {
    log.error('Failed to save temp credentials', { error });
    throw error;
  }
}

export async function saveCredentials(
  token: string,
  userId: string,
): Promise<void> {
  credentialsVersion += 1;
  try {
    await SecureStore.setItemAsync(
      storageKey(userId),
      JSON.stringify({ token }),
    );
    log.info('Credentials saved', { userId });
  } catch (error) {
    log.error('Failed to save credentials', { error });
    throw error;
  } finally {
    credentialsVersion += 1;
  }
}

export async function getCredentials(
  userId: string,
): Promise<AuthCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(userId));
    if (!raw) return null;
    return parseCredentials(raw);
  } catch (error) {
    log.error('Failed to get credentials', { error });
    return null;
  }
}

export async function getTempCredentials(): Promise<AuthCredentials | null> {
  try {
    const raw = await SecureStore.getItemAsync(TEMP_KEY);
    if (!raw) return null;
    return parseCredentials(raw);
  } catch (error) {
    log.error('Failed to get temp credentials', { error });
    return null;
  }
}

export async function clearTempCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TEMP_KEY);
    log.info('Temp credentials cleared');
  } catch {
    // ignore if already cleared
  }
}

const accountLocks = new Map<string, Promise<unknown>>();

/**
 * Runs verifier writes, account removal and cleanup retries for one account
 * in order, so a token check and the write that depends on it cannot
 * interleave with a removal.
 */
function withAccountLock<T>(userId: string, task: () => Promise<T>) {
  const prior = accountLocks.get(userId) ?? Promise.resolve();
  const run = prior.then(task, task);
  const settled = run.catch(() => undefined);
  accountLocks.set(userId, settled);
  void settled.then(() => {
    if (accountLocks.get(userId) === settled) accountLocks.delete(userId);
  });
  return run;
}

/**
 * Saves the verifier only while `token` is still this account's stored
 * token. Returns false, and writes nothing, when the account was removed or
 * signed in again since.
 */
export function savePasswordVerifierRecord(
  userId: string,
  record: string,
  token: string,
): Promise<boolean> {
  return withAccountLock(userId, async () => {
    const current = await getCredentials(userId);
    if (current?.token !== token) {
      log.info('Password verifier skipped: session changed', { userId });
      return false;
    }
    try {
      await SecureStore.setItemAsync(verifierKey(userId), record);
      // A fresh record must not be deleted by an older cleanup retry.
      setVerifierCleanupPending(userId, false);
      log.info('Password verifier saved', { userId });
      return true;
    } catch (error) {
      log.error('Failed to save password verifier', { error });
      throw error;
    }
  });
}

export async function getPasswordVerifierRecord(
  userId: string,
): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(verifierKey(userId));
  } catch (error) {
    log.error('Failed to get password verifier', { error });
    return null;
  }
}

/**
 * Deletes the stored verifier. Returns true only when it is gone: deleted, or
 * confirmed missing by a read after the delete failed. A false result is
 * queued and retried by {@link retryPendingVerifierCleanup}.
 */
async function clearPasswordVerifier(userId: string): Promise<boolean> {
  let cleared: boolean;
  try {
    await SecureStore.deleteItemAsync(verifierKey(userId));
    cleared = true;
  } catch (deleteError) {
    try {
      cleared = (await SecureStore.getItemAsync(verifierKey(userId))) === null;
    } catch {
      cleared = false;
    }
    if (!cleared) {
      log.error('Password verifier cleanup incomplete', {
        userId,
        error: deleteError,
      });
    }
  }
  setVerifierCleanupPending(userId, !cleared);
  if (cleared) log.info('Password verifier cleared', { userId });
  return cleared;
}

/** Retries verifier deletions that an earlier account removal left behind. */
export async function retryPendingVerifierCleanup(): Promise<void> {
  for (const userId of getPendingVerifierCleanupUserIds()) {
    await withAccountLock(userId, async () => {
      // A verifier saved since the queue was read is no longer pending.
      if (getPendingVerifierCleanupUserIds().includes(userId)) {
        await clearPasswordVerifier(userId);
      }
    });
  }
}

export interface ClearCredentialsResult {
  /** False when the password verifier is still stored; a retry is queued. */
  verifierCleared: boolean;
}

export async function clearCredentials(
  userId: string,
): Promise<ClearCredentialsResult> {
  credentialsVersion += 1;
  let result: ClearCredentialsResult;
  try {
    result = await withAccountLock(userId, async () => {
      const verifierCleared = await clearPasswordVerifier(userId);
      await SecureStore.deleteItemAsync(storageKey(userId));
      log.info('Credentials cleared', { userId, verifierCleared });
      return { verifierCleared };
    });
  } catch (error) {
    log.error('Failed to clear credentials', { error });
    throw error;
  } finally {
    credentialsVersion += 1;
  }
  await retryPendingVerifierCleanup();
  return result;
}

export async function hasCredentials(userId: string): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(userId));
    return raw !== null && raw.length > 0;
  } catch {
    return false;
  }
}

/** Known account IDs from KV; expo-secure-store has no enumeration API. */
export async function getAllStoredUserIds(): Promise<string[]> {
  return getKnownUserIds();
}
