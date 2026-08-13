import { StorageInventoryResource } from '../types/prepareOffline/types';

export interface StorageResourceNameGroup {
  resourceName: string;
  resources: StorageInventoryResource[];
}

/** Groups inventory rows by resource name for nested accordion content (#53). */
export function groupStorageResourcesByName(
  resources: StorageInventoryResource[],
): StorageResourceNameGroup[] {
  const byName = new Map<string, StorageInventoryResource[]>();

  for (const resource of resources) {
    const key = resource.resourceName.trim() || resource.label;
    byName.set(key, [...(byName.get(key) ?? []), resource]);
  }

  return [...byName.entries()].map(([resourceName, items]) => ({
    resourceName,
    resources: items,
  }));
}
