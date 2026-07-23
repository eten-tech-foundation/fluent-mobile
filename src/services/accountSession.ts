import { FluentAPI } from './api';
import { authToken } from './authToken';
import { clearCredentials, getCredentials } from './keychain';
import { signOut } from './authSession';
import {
  getActiveUserId,
  getKnownUserIds,
  kvStorage,
  KV_KEYS,
  switchActiveUser,
} from './storage';
import { logger } from '../utils/logger';

const log = logger.create('accountSession');

/**
 * Activates a stored device account that has a usable session token.
 * Throws if credentials are missing or have no token.
 */
export async function switchToDeviceAccount(userId: string): Promise<void> {
  const creds = await getCredentials(userId);
  if (!creds?.token) {
    throw new Error('No usable stored session for this account');
  }

  authToken.set(creds.token);
  switchActiveUser(userId);
}

export type SignOutDeviceAccountResult =
  | { kind: 'switched'; userId: string }
  | { kind: 'signed_out' };

/**
 * Signs out the active device account (best-effort server sign-out), removes
 * local credentials, and either switches to another known account with a
 * usable token or clears the in-memory session entirely.
 */
export async function signOutCurrentDeviceAccount(): Promise<SignOutDeviceAccountResult> {
  const currentUserId = getActiveUserId();

  try {
    await FluentAPI.signOut();
  } catch (error) {
    log.error('Server sign out failed', { error });
  }

  await clearCredentials(currentUserId);

  const remaining = getKnownUserIds().filter(id => id !== currentUserId);
  kvStorage.setItemSync(KV_KEYS.KNOWN_USER_IDS, remaining.join(','));
  log.info('User signed out', { userId: currentUserId });

  for (const candidateUserId of remaining) {
    try {
      const creds = await getCredentials(candidateUserId);
      if (!creds?.token) {
        log.error('Skipping candidate account with no usable session', {
          userId: candidateUserId,
        });
        continue;
      }

      authToken.set(creds.token);
      switchActiveUser(candidateUserId);
      return { kind: 'switched', userId: candidateUserId };
    } catch (error) {
      log.error('Failed to read credentials for candidate account', {
        userId: candidateUserId,
        error,
      });
    }
  }

  signOut();
  return { kind: 'signed_out' };
}
