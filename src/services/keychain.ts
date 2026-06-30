import * as SecureStore from 'expo-secure-store';
import { logger } from '../utils/logger';
import { getKnownUserIds } from './storage';

const log = logger.create('Keychain');
const SERVICE_PREFIX = 'fluent.auth';
const TEMP_KEY = SERVICE_PREFIX;

export interface AuthCredentials {
  token: string;
}

function storageKey(userId: string): string {
  return `${SERVICE_PREFIX}.${userId}`;
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
  try {
    await SecureStore.setItemAsync(
      storageKey(userId),
      JSON.stringify({ token }),
    );
    log.info('Credentials saved', { userId });
  } catch (error) {
    log.error('Failed to save credentials', { error });
    throw error;
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

export async function clearCredentials(userId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(storageKey(userId));
    log.info('Credentials cleared', { userId });
  } catch (error) {
    log.error('Failed to clear credentials', { error });
    throw error;
  }
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
