import {
  BuildPrepareOfflineCatalogInput,
  PrepareOfflineCatalog,
  PrepareOfflineResourceGroup,
  PrepareOfflineResourceItem,
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceStatus,
  PrepareOfflineResourceTier,
} from '../types/prepareOffline/types';
import {
  hasPendingDownloadWork,
  isManifestItemSizeKnown,
  summarizeDownloadSizes,
} from './prepareOfflineSizeSemantics';

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

/** A row is locked if it's core Tier 1, required-and-non-removable, or already on device. */
export function isItemCustomizeLocked(
  item: PrepareOfflineResourceItem,
): boolean {
  return (
    isTierLocked(item.tier) ||
    (item.required && !item.removable) ||
    item.status === 'completed'
  );
}

export function isItemIncluded(
  item: PrepareOfflineResourceItem,
  deselectedItemIds: Set<string>,
): boolean {
  if (isItemCustomizeLocked(item)) {
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
  return summarizeDownloadSizes(getEffectiveItems(catalog, deselectedItemIds))
    .knownBytes;
}

/** True when any selected catalog row has unknown remote size. */
export function catalogHasUnknownSizes(
  catalog: PrepareOfflineCatalog,
  deselectedItemIds: Set<string>,
): boolean {
  return summarizeDownloadSizes(getEffectiveItems(catalog, deselectedItemIds))
    .hasUnknown;
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
  // Keep known lower-bound bytes on mixed unknown rows (e.g. 4096 + unknown).
  // Fully unknown zero still returns 0; callers enable Download via
  // hasPendingDownloadWork (#756).
  return item.bytes;
}

/** Sum of pending bytes for a set of items (excludes completed; no partial-progress adjustment). */
export function computeRemainingBytes(
  items: PrepareOfflineResourceItem[],
): number {
  return items.reduce((sum, item) => sum + getRemainingBytesForItem(item), 0);
}

export { hasPendingDownloadWork };

interface AggregatedRow {
  groupName: string;
  kind: PrepareOfflineResourceItem['kind'];
  tier: PrepareOfflineResourceTier;
  bytes: number;
  sizeKnown: boolean;
  required: boolean;
  removable: boolean;
  members: PrepareOfflineResourceManifestItem[];
}

/**
 * Groups raw manifest items into one row per (groupName, kind) — e.g. all
 * individual Translation Words entries collapse into a single "Text" row
 * and a single "Audio" row, summing bytes. Mirrors the pre-aggregated shape
 * the old static mock manifest provided directly (#504).
 */
function aggregateManifestItems(
  manifest: PrepareOfflineResourceManifestItem[],
): AggregatedRow[] {
  const byKey = new Map<string, AggregatedRow>();

  for (const entry of manifest) {
    const key = `${entry.resourceName}:${entry.kind}`;
    const memberKnown = isManifestItemSizeKnown(entry);
    const existing = byKey.get(key);
    if (existing) {
      if (memberKnown) {
        existing.bytes += entry.bytesTotal;
      } else {
        existing.sizeKnown = false;
      }
      existing.members.push(entry);
    } else {
      byKey.set(key, {
        groupName: entry.resourceName,
        kind: entry.kind,
        tier: entry.tier,
        bytes: memberKnown ? entry.bytesTotal : 0,
        sizeKnown: memberKnown,
        required: entry.required,
        removable: entry.removable,
        members: [entry],
      });
    }
  }

  return [...byKey.values()];
}

/**
 * Aggregate status across an aggregated row's members.
 * - No members → available.
 * - All completed → completed.
 * - Any downloading → downloading; else any paused → paused.
 * - Otherwise the row is only partly on device (or not at all), so it must
 *   NOT report completed: return the first member status that isn't
 *   completed (available/selected passthrough). Reporting completed here
 *   would lock the row in customize and drop it from pending bytes, so the
 *   remaining members would never be queued.
 */
function aggregateStatus(
  members: PrepareOfflineResourceManifestItem[],
  getResourceStatus: (resourceId: string) => PrepareOfflineResourceStatus,
): PrepareOfflineResourceStatus {
  const statuses = members.map(m => getResourceStatus(m.id));
  if (statuses.length === 0) return 'available';
  if (statuses.every(s => s === 'completed')) return 'completed';
  if (statuses.some(s => s === 'downloading')) return 'downloading';
  if (statuses.some(s => s === 'paused')) return 'paused';
  return statuses.find(s => s !== 'completed') ?? 'available';
}

/** Builds Tier 2/3 catalog rows from raw manifest items (one row per resource+kind). */
function buildManifestRows(
  manifest: PrepareOfflineResourceManifestItem[],
  getResourceStatus: (resourceId: string) => PrepareOfflineResourceStatus,
): PrepareOfflineResourceItem[] {
  const aggregated = aggregateManifestItems(manifest);

  return aggregated.map(row => ({
    id: `${row.groupName}:${row.kind}`,
    tier: row.tier,
    kind: row.kind,
    groupName: row.groupName,
    required: row.required,
    removable: row.removable,
    label:
      row.kind === 'text' ? 'Text' : row.kind === 'audio' ? 'Audio' : 'Image',
    bytes: row.bytes,
    sizeKnown: row.sizeKnown,
    status: aggregateStatus(row.members, getResourceStatus),
    manifestMembers: row.members,
  }));
}

/**
 * Pure catalog builder — manifest (including Tier 1 Source Bible text/audio,
 * merged in by prepareOfflineResources.fetchPrepareOfflineManifest) and
 * status come from the prepareOfflineResources service. Tier 1 rows arrive
 * through the same manifest array as Tier 2/3, so no separate core-items
 * source is needed here (#504).
 */
export function buildPrepareOfflineCatalog({
  manifest,
  getResourceStatus,
  chapters,
  selectedIds,
}: BuildPrepareOfflineCatalogInput): PrepareOfflineCatalog {
  const selectedChapters = chapters.filter(ch => selectedIds.has(ch.id));

  if (selectedChapters.length === 0) {
    return { items: [], groups: [] };
  }

  const items = buildManifestRows(manifest, getResourceStatus);

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
