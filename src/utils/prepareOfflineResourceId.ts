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

/** Queue + catalog id scoped per project (download_queue primary key). */
export function scopedPrepareOfflineResourceId(
  projectId: number,
  tier: PrepareOfflineResourceTier,
  groupName: string,
  kind: PrepareOfflineResourceKind,
): string {
  return `${projectId}-${manifestEntryToResourceId(tier, groupName, kind)}`;
}

/** Mock inventory keys omit the project prefix. */
export function unscopedPrepareOfflineResourceId(
  projectId: number,
  scopedResourceId: string,
): string {
  const prefix = `${projectId}-`;
  return scopedResourceId.startsWith(prefix)
    ? scopedResourceId.slice(prefix.length)
    : scopedResourceId;
}

export function kindLabel(kind: PrepareOfflineResourceKind): string {
  if (kind === 'text') {
    return 'Text';
  }
  if (kind === 'image') {
    return 'Image';
  }
  return 'Audio';
}
