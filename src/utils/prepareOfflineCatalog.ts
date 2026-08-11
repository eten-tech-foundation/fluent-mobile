import {
  BuildPrepareOfflineCatalogInput,
  PrepareOfflineCatalog,
  PrepareOfflineChapterRow,
  PrepareOfflineResourceGroup,
  PrepareOfflineResourceItem,
  PrepareOfflineResourceManifestEntry,
  PrepareOfflineResourceScope,
  PrepareOfflineResourceTier,
} from '../types/prepareOffline/types';
import {
  kindLabel,
  manifestEntryToResourceId,
} from './prepareOfflineResourceId';

function computeManifestBytes(
  entry: PrepareOfflineResourceManifestEntry,
  selectedChapters: PrepareOfflineChapterRow[],
): number {
  const bookIds = new Set(selectedChapters.map(ch => ch.bookId));
  return computeManifestBytesForScope(
    entry.scope,
    entry.unitBytes,
    selectedChapters.length,
    bookIds.size,
  );
}

function groupItemsByName(
  items: PrepareOfflineResourceItem[],
): PrepareOfflineResourceGroup[] {
  const order: string[] = [];
  const map = new Map<string, PrepareOfflineResourceItem[]>();

  for (const item of items) {
    if (!map.has(item.groupName)) {
      order.push(item.groupName);
      map.set(item.groupName, []);
    }
    map.get(item.groupName)!.push(item);
  }

  return order.map(groupName => ({
    groupName,
    items: map.get(groupName)!,
  }));
}

export function isTierLocked(tier: PrepareOfflineResourceTier): boolean {
  return tier === 1;
}

/** Tier 2/3 rows already on device cannot be toggled; in-flight/pending stay editable. */
export function isItemCustomizeLocked(
  item: PrepareOfflineResourceItem,
): boolean {
  return isTierLocked(item.tier) || item.status === 'completed';
}

export function isItemIncluded(
  item: PrepareOfflineResourceItem,
  deselectedItemIds: Set<string>,
): boolean {
  if (isTierLocked(item.tier) || item.status === 'completed') {
    return true;
  }

  return !deselectedItemIds.has(item.id);
}

export function getEffectiveItems(
  catalog: PrepareOfflineCatalog,
  deselectedItemIds: Set<string>,
): PrepareOfflineResourceItem[] {
  return catalog.items.filter(item => isItemIncluded(item, deselectedItemIds));
}

/** Subset of catalog items matching the given tiers (preserves group order). */
export function filterPrepareOfflineCatalogByTiers(
  catalog: PrepareOfflineCatalog,
  tiers: PrepareOfflineResourceTier[],
): PrepareOfflineCatalog {
  const tierSet = new Set<PrepareOfflineResourceTier>(tiers);
  const items = catalog.items.filter(item => tierSet.has(item.tier));

  return {
    items,
    groups: groupItemsByName(items),
  };
}

/** Catalog filtered by customize deselects — used for the read-only summary. */
export function buildEffectiveCatalog(
  catalog: PrepareOfflineCatalog,
  deselectedItemIds: Set<string>,
): PrepareOfflineCatalog {
  const items = getEffectiveItems(catalog, deselectedItemIds);
  return {
    items,
    groups: groupItemsByName(items),
  };
}

export function computeTotalBytes(
  catalog: PrepareOfflineCatalog,
  deselectedItemIds: Set<string>,
): number {
  return getEffectiveItems(catalog, deselectedItemIds).reduce(
    (sum, item) => sum + item.bytes,
    0,
  );
}

export function computePendingBytes(
  catalog: PrepareOfflineCatalog,
  deselectedItemIds: Set<string>,
): number {
  return computeRemainingBytes(getEffectiveItems(catalog, deselectedItemIds));
}

/** Pending bytes for one catalog row (full catalog size; not adjusted for partial download). */
export function getRemainingBytesForItem(
  item: PrepareOfflineResourceItem,
): number {
  if (item.status === 'completed') {
    return 0;
  }

  return item.bytes;
}

/** Sum of pending bytes for a set of items (excludes completed; no partial-progress adjustment). */
export function computeRemainingBytes(
  items: PrepareOfflineResourceItem[],
): number {
  return items.reduce((sum, item) => sum + getRemainingBytesForItem(item), 0);
}

/** Pure catalog builder — manifest and status come from prepareOfflineResources service. */
export function buildPrepareOfflineCatalog({
  manifest,
  getResourceStatus,
  chapters,
  selectedIds,
}: BuildPrepareOfflineCatalogInput): PrepareOfflineCatalog {
  const selectedChapters = chapters.filter(ch => selectedIds.has(ch.id));
  if (selectedChapters.length === 0 || manifest.length === 0) {
    return { items: [], groups: [] };
  }

  const items: PrepareOfflineResourceItem[] = manifest.map(entry => {
    const id = manifestEntryToResourceId(
      entry.tier,
      entry.groupName,
      entry.kind,
    );

    return {
      id,
      tier: entry.tier,
      kind: entry.kind,
      groupName: entry.groupName,
      label: kindLabel(entry.kind),
      bytes: computeManifestBytes(entry, selectedChapters),
      status: getResourceStatus(id),
    };
  });

  return {
    items,
    groups: groupItemsByName(items),
  };
}

/** Tier-ordered download sequence: manifest order (tier → group → text before audio). */
export function sortItemsForPrepareOfflineDownload(
  items: PrepareOfflineResourceItem[],
  catalogItems: PrepareOfflineResourceItem[],
): PrepareOfflineResourceItem[] {
  const indexById = new Map(
    catalogItems.map((item, index) => [item.id, index]),
  );

  return [...items].sort(
    (a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0),
  );
}

/** Exported for tests — documents how manifest scope affects byte totals. */
export function computeManifestBytesForScope(
  scope: PrepareOfflineResourceScope,
  unitBytes: number,
  selectedChapterCount: number,
  selectedBookCount: number,
): number {
  switch (scope) {
    case 'project':
      return unitBytes;
    case 'chapter':
      return unitBytes * selectedChapterCount;
    case 'book':
      return unitBytes * selectedBookCount;
    default:
      return unitBytes;
  }
}
