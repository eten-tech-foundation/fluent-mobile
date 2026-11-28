import { getUserOrgGrants } from '../services/userOrgGrants';

/**
 * Exact role name from fluent-api `ROLES.PROJECT_TRANSLATOR` (`src/lib/roles.ts`,
 * blob `c5a9ffc170beefe91c37f2415e273602f17b6fb7`). Kept local to My Work —
 * do not add Translator helpers to shared `userOrgGrants`.
 */
const PROJECT_TRANSLATOR_ROLE_NAME = 'Project Translator';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Derive Project Translator project IDs from the existing org-grant snapshot
 * (`getUserOrgGrants`). Unknown/revoked/unregistered → [] (fail closed).
 * Org-only grants (null projectId) excluded.
 */
export function getTranslatorProjectIds(userId: string): number[] {
  const snapshot = getUserOrgGrants(userId);
  if (snapshot.status !== 'known') return [];
  const ids = new Set<number>();
  for (const grant of snapshot.grants) {
    if (
      grant.roleName === PROJECT_TRANSLATOR_ROLE_NAME &&
      grant.projectId !== null &&
      isPositiveInteger(grant.projectId)
    ) {
      ids.add(grant.projectId);
    }
  }
  return [...ids];
}

export function hasProjectTranslatorGrant(
  userId: string,
  projectId: number,
): boolean {
  if (!isPositiveInteger(projectId)) return false;
  return getTranslatorProjectIds(userId).includes(projectId);
}
