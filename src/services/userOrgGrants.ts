import type { ApiOrgGrant, ApiUser } from '../types/api/responses';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { getCredentials } from './keychain';
import { emitAuthReauthRequired } from './syncEvents';
import {
  getActiveUserId,
  getKnownUserIds,
  getUserEmail,
  isReauthRequired,
  kvStorage,
  setReauthRequired,
} from './storage';

const log = logger.create('UserOrgGrants');

/** Exact role name from fluent-api org grants for project Observer access. */
export const PROJECT_OBSERVER_ROLE_NAME = 'Project Observer';

export type UserOrgGrantsSnapshot =
  | { status: 'known'; grants: readonly ApiOrgGrant[] }
  | { status: 'unknown' };

const grantSnapshotKey = (userId: string) => `${userId}:org_grant_snapshot`;

/** Per-user generation: logout clear, persist, and newer refresh invalidate older completions. */
const refreshGenerationByUser = new Map<string, number>();

function bumpRefreshGeneration(userId: string): number {
  const next = (refreshGenerationByUser.get(userId) ?? 0) + 1;
  refreshGenerationByUser.set(userId, next);
  return next;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRegisteredDeviceAccount(userId: string): boolean {
  return Boolean(userId) && getKnownUserIds().includes(userId);
}

function isIntegerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function parseOrgGrant(value: unknown): ApiOrgGrant | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!isIntegerId(raw.roleId) || typeof raw.roleName !== 'string') {
    return null;
  }
  // fluent-api: orgId z.number().int().nullable() (required key; null for SuperAdmin)
  if (raw.orgId !== null && !isIntegerId(raw.orgId)) {
    return null;
  }
  const projectId =
    raw.projectId === undefined || raw.projectId === null
      ? null
      : raw.projectId;
  if (projectId !== null && !isIntegerId(projectId)) {
    return null;
  }
  if (
    raw.orgName !== undefined &&
    raw.orgName !== null &&
    typeof raw.orgName !== 'string'
  ) {
    return null;
  }
  const grant: ApiOrgGrant = {
    roleId: raw.roleId,
    roleName: raw.roleName,
    orgId: raw.orgId,
    projectId,
  };
  if (raw.orgName !== undefined) {
    grant.orgName = raw.orgName;
  }
  return grant;
}

/**
 * Parse `orgGrants` from a user payload.
 * - missing / non-array → unknown (do not treat as revoked)
 * - [] → known empty (revoked / none)
 * - array → known with only structurally valid grants; any malformed item → unknown
 */
export function parseOrgGrantsFromUser(
  user: ApiUser | null | undefined,
): UserOrgGrantsSnapshot {
  if (!user || typeof user !== 'object') {
    return { status: 'unknown' };
  }
  if (!Object.prototype.hasOwnProperty.call(user, 'orgGrants')) {
    return { status: 'unknown' };
  }
  const raw = user.orgGrants;
  if (!Array.isArray(raw)) {
    return { status: 'unknown' };
  }
  const grants: ApiOrgGrant[] = [];
  for (const item of raw) {
    const parsed = parseOrgGrant(item);
    if (!parsed) {
      return { status: 'unknown' };
    }
    grants.push(parsed);
  }
  return { status: 'known', grants };
}

function writeSnapshot(userId: string, snapshot: UserOrgGrantsSnapshot): void {
  if (!userId) return;
  kvStorage.setItemSync(grantSnapshotKey(userId), JSON.stringify(snapshot));
}

function readStoredSnapshot(userId: string): UserOrgGrantsSnapshot {
  const raw = kvStorage.getItemSync(grantSnapshotKey(userId));
  if (raw === null || raw === undefined || raw === '') {
    return { status: 'unknown' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return { status: 'unknown' };
    }
    const record = parsed as Record<string, unknown>;
    if (record.status === 'unknown') {
      return { status: 'unknown' };
    }
    if (record.status !== 'known' || !Array.isArray(record.grants)) {
      return { status: 'unknown' };
    }
    const grants: ApiOrgGrant[] = [];
    for (const item of record.grants) {
      const grant = parseOrgGrant(item);
      if (!grant) {
        return { status: 'unknown' };
      }
      grants.push(grant);
    }
    return { status: 'known', grants };
  } catch {
    return { status: 'unknown' };
  }
}

/** Fail-closed read for My Work / download consumers. */
export function getUserOrgGrants(userId: string): UserOrgGrantsSnapshot {
  if (!userId || !isRegisteredDeviceAccount(userId)) {
    return { status: 'unknown' };
  }
  if (isReauthRequired(userId)) {
    return { status: 'unknown' };
  }
  return readStoredSnapshot(userId);
}

export function hasProjectObserverGrant(
  userId: string,
  projectId: number,
): boolean {
  if (!isIntegerId(projectId)) return false;
  const snapshot = getUserOrgGrants(userId);
  if (snapshot.status !== 'known') return false;
  return snapshot.grants.some(
    grant =>
      grant.roleName === PROJECT_OBSERVER_ROLE_NAME &&
      grant.projectId === projectId,
  );
}

/** Project IDs with an exact Project Observer grant (org-only grants excluded). */
export function getObserverProjectIds(userId: string): number[] {
  const snapshot = getUserOrgGrants(userId);
  if (snapshot.status !== 'known') return [];
  const ids = new Set<number>();
  for (const grant of snapshot.grants) {
    if (
      grant.roleName === PROJECT_OBSERVER_ROLE_NAME &&
      grant.projectId !== null
    ) {
      ids.add(grant.projectId);
    }
  }
  return [...ids];
}

/**
 * Persist grants from an already-validated user response for `expectedUserId`.
 * User-id mismatch / missing / malformed → unknown (clears stale positives).
 * Successful `[]` → known empty (revocation).
 */
export function persistOrgGrantsFromUserResponse(
  expectedUserId: string,
  user: ApiUser | null | undefined,
): UserOrgGrantsSnapshot {
  if (!expectedUserId) {
    return { status: 'unknown' };
  }
  bumpRefreshGeneration(expectedUserId);
  if (
    !user ||
    typeof user !== 'object' ||
    !isIntegerId(user.id) ||
    String(user.id) !== expectedUserId
  ) {
    writeSnapshot(expectedUserId, { status: 'unknown' });
    log.warn('Org grant persist skipped; user id mismatch or invalid user', {
      expectedUserId,
      responseUserId: user && typeof user === 'object' ? user.id : undefined,
    });
    return { status: 'unknown' };
  }

  const snapshot = parseOrgGrantsFromUser(user);
  writeSnapshot(expectedUserId, snapshot);
  if (snapshot.status === 'unknown') {
    log.warn(
      'Org grant snapshot marked unknown (missing/malformed orgGrants)',
      {
        userId: expectedUserId,
      },
    );
  } else {
    log.info('Org grant snapshot persisted', {
      userId: expectedUserId,
      grantCount: snapshot.grants.length,
    });
  }
  return snapshot;
}

export function markUserOrgGrantsUnknown(userId: string): void {
  if (!userId) return;
  writeSnapshot(userId, { status: 'unknown' });
}

/** Remove stored snapshot for one account (sign-out); other accounts untouched. */
export function clearUserOrgGrantSnapshot(userId: string): void {
  if (!userId) return;
  bumpRefreshGeneration(userId);
  kvStorage.removeItemSync(grantSnapshotKey(userId));
}

function noteAuthFailure(userId: string): void {
  markUserOrgGrantsUnknown(userId);
  setReauthRequired(userId);
  if (userId === getActiveUserId()) {
    emitAuthReauthRequired(userId);
  }
}

async function isRefreshCompletionCurrent(
  userId: string,
  requestGen: number,
  sessionToken: string,
): Promise<boolean> {
  if (refreshGenerationByUser.get(userId) !== requestGen) {
    return false;
  }
  if (!isRegisteredDeviceAccount(userId)) {
    return false;
  }
  const creds = await getCredentials(userId);
  if (refreshGenerationByUser.get(userId) !== requestGen) {
    return false;
  }
  return creds?.token === sessionToken;
}

/**
 * Refresh grants via `getUserByEmail` with the captured account token/email.
 * Does not switch the active account. Network failures leave the prior snapshot
 * unchanged (never fabricate `[]`). Auth failure marks unknown + reauth.
 * Stale completions (logout, credential replace, newer refresh/persist) are dropped.
 */
export async function refreshUserOrgGrants(
  userId: string,
  sessionToken: string,
): Promise<void> {
  if (!userId || !sessionToken) return;
  if (!isRegisteredDeviceAccount(userId)) {
    log.warn('Org grant refresh skipped; account not registered on device', {
      userId,
    });
    return;
  }

  const email = getUserEmail(userId);
  if (!email) {
    log.warn('Org grant refresh skipped; no email for account', { userId });
    return;
  }

  const requestGen = bumpRefreshGeneration(userId);

  try {
    const user = await FluentAPI.getUserByEmail(email, sessionToken);
    if (!(await isRefreshCompletionCurrent(userId, requestGen, sessionToken))) {
      log.info('Org grant refresh discarded; completion no longer current', {
        userId,
      });
      return;
    }
    persistOrgGrantsFromUserResponse(userId, user);
  } catch (error) {
    if (!(await isRefreshCompletionCurrent(userId, requestGen, sessionToken))) {
      log.info(
        'Org grant refresh error discarded; completion no longer current',
        {
          userId,
          error: getErrorMessage(error),
        },
      );
      return;
    }
    if (isAuthError(error)) {
      noteAuthFailure(userId);
      throw error;
    }
    log.warn('Org grant refresh failed; retaining prior snapshot', {
      userId,
      error: getErrorMessage(error),
    });
  }
}
