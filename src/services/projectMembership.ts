import { FluentAPI } from './api';
import { unwrapApiListResponse } from '../types/api/responses';
import {
  insertUserProjects,
  reconcileUserProjects,
  selectExistingIds,
} from '../db/repository';
import { getCredentials } from './keychain';
import { AuthError } from './authError';
import { getActiveUserId, setReauthRequired } from './storage';
import { emitAuthReauthRequired } from './syncEvents';
import { logger } from '../utils/logger';

const log = logger.create('ProjectMembership');

/** `AuthError.code` when an account's stored credentials are gone. */
export const OWNER_CREDENTIALS_MISSING = 'OWNER_CREDENTIALS_MISSING';

/** Owners whose membership the latest refresh confirmed with the server. */
let verifiedOwners: ReadonlySet<number> = new Set();

/**
 * Owners confirmed by the most recent `refreshMembershipForOwners`. Chapter
 * passes inherit this from the session that refreshed, so they neither repeat
 * the request per chapter nor act on an owner nobody could verify.
 */
export function getVerifiedMembershipOwners(): ReadonlySet<number> {
  return verifiedOwners;
}

/**
 * Replace the cached `user_projects` rows for `userId` with the server's
 * current membership (#848 / #855).
 *
 * Reconcile is cache-only, so it cannot see a removal that happened while the
 * device was offline: a stale membership row would let a take upload for a
 * project the account has left, and the server would reject it into a
 * permanent failure. Writing both directions keeps one source of truth for
 * every later pass:
 * - a project the account has left is deleted, so its takes become `held`;
 * - a project the account was re-added to is inserted, so its held takes are
 *   released and upload on the same pass with no extra user step.
 *
 * Throws when membership cannot be confirmed (no credentials, transport or API
 * error, unexpected response shape). Callers must defer uploads rather than
 * upload against a cache they could not verify.
 */
export async function refreshProjectMembership(
  userId: number | null,
): Promise<void> {
  if (userId === null || !Number.isFinite(userId) || userId <= 0) {
    throw new Error('An active user is required to refresh project membership');
  }

  const credentials = await getCredentials(String(userId));
  const token = credentials?.token;
  if (!token) {
    throw new AuthError(
      `No credentials for user ${userId}`,
      OWNER_CREDENTIALS_MISSING,
    );
  }

  const response = await FluentAPI.getUserProjects(userId, token);
  const raw = unwrapApiListResponse(response);
  if (!Array.isArray(raw)) {
    // Never read an unexpected payload as "no projects": that would hold every
    // take on the device.
    throw new Error('Unexpected project membership response shape');
  }

  const currentProjectIds = [
    ...new Set(
      raw
        .map(row => Number((row as { id?: unknown } | null)?.id))
        .filter(id => Number.isFinite(id) && id > 0),
    ),
  ];

  // `user_projects.project_id` references `projects(id)`, so only insert
  // memberships whose project row is already cached. A project this device has
  // never synced cannot own local takes anyway; a missing parent row must not
  // fail the whole refresh.
  const cachedProjectIds = await selectExistingIds(
    'projects',
    currentProjectIds,
  );
  await insertUserProjects(userId, [...cachedProjectIds]);
  await reconcileUserProjects(userId, currentProjectIds);

  log.info('Refreshed project membership', {
    userId,
    memberProjects: currentProjectIds.length,
    cachedProjects: cachedProjectIds.size,
  });
}

/**
 * Refresh membership for every account that owns work on the device (#855).
 *
 * One account that cannot be confirmed (expired session, transport error)
 * must not block the others: it is left out of the returned set and its takes
 * stay deferred, while verified accounts upload. An owner whose credentials
 * are gone enters the reauth path, mirroring the queued-claim owner handling.
 */
export async function refreshMembershipForOwners(
  ownerIds: readonly number[],
): Promise<Set<number>> {
  const verified = new Set<number>();
  for (const ownerId of new Set(ownerIds)) {
    try {
      await refreshProjectMembership(ownerId);
      verified.add(ownerId);
    } catch (error) {
      log.warn('Membership refresh failed for owner; deferring their takes', {
        userId: ownerId,
        error,
      });
      if (
        error instanceof AuthError &&
        error.code === OWNER_CREDENTIALS_MISSING
      ) {
        setReauthRequired(String(ownerId));
        if (getActiveUserId() === String(ownerId)) {
          emitAuthReauthRequired(String(ownerId));
        }
      }
    }
  }
  verifiedOwners = verified;
  return verified;
}
