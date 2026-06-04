import * as Keychain from 'react-native-keychain';
import { logger } from '../utils/logger';

const log = logger.create('Keychain');
const SERVICE_PREFIX = 'fluent.auth';
const TEMP_SERVICE = SERVICE_PREFIX;

export interface AuthCredentials {
  token: string;
}

function serviceKey(userId: string): string {
  return `${SERVICE_PREFIX}.${userId}`;
}

// Save token temporarily (before numeric userId is known)
export async function saveTempCredentials(token: string): Promise<void> {
  try {
    await Keychain.setGenericPassword('user', JSON.stringify({ token }), {
      service: TEMP_SERVICE,
    });
    log.info('Temp credentials saved');
  } catch (error) {
    log.error('Failed to save temp credentials', { error });
    throw error;
  }
}

// Save token permanently under numeric userId
export async function saveCredentials(
  token: string,
  userId: string,
): Promise<void> {
  try {
    await Keychain.setGenericPassword(userId, JSON.stringify({ token }), {
      service: serviceKey(userId),
    });
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
    const result = await Keychain.getGenericPassword({
      service: serviceKey(userId),
    });
    if (!result) return null;
    return JSON.parse(result.password) as AuthCredentials;
  } catch (error) {
    log.error('Failed to get credentials', { error });
    return null;
  }
}

export async function getTempCredentials(): Promise<AuthCredentials | null> {
  try {
    const result = await Keychain.getGenericPassword({ service: TEMP_SERVICE });
    if (!result) return null;
    return JSON.parse(result.password) as AuthCredentials;
  } catch (error) {
    log.error('Failed to get temp credentials', { error });
    return null;
  }
}

export async function clearTempCredentials(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: TEMP_SERVICE });
    log.info('Temp credentials cleared');
  } catch {
    // ignore if already cleared
  }
}

export async function clearCredentials(userId: string): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: serviceKey(userId) });
    log.info('Credentials cleared', { userId });
  } catch (error) {
    log.error('Failed to clear credentials', { error });
    throw error;
  }
}

export async function hasCredentials(userId: string): Promise<boolean> {
  try {
    const result = await Keychain.getGenericPassword({
      service: serviceKey(userId),
    });
    return !!result;
  } catch {
    return false;
  }
}

export async function getAllStoredUserIds(): Promise<string[]> {
  try {
    const allServices = await Keychain.getAllGenericPasswordServices();
    return allServices
      .filter(s => s.startsWith(`${SERVICE_PREFIX}.`))
      .map(s => s.replace(`${SERVICE_PREFIX}.`, ''));
  } catch {
    return [];
  }
}
