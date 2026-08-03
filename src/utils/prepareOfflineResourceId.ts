import {
  PrepareOfflineResourceKind,
  PrepareOfflineResourceTier,
} from '../types/prepareOffline/types';

/** Stable client-side id until fluent-api provides server ids (#201). */
export function manifestEntryToResourceId(
  tier: PrepareOfflineResourceTier,
  groupName: string,
  kind: PrepareOfflineResourceKind,
): string {
  const slug = groupName.toLowerCase().replace(/\s+/g, '-');
  return `tier-${tier}-${slug}-${kind}`;
}

export function kindLabel(kind: PrepareOfflineResourceKind): string {
  return kind === 'text' ? 'Text' : 'Audio';
}
