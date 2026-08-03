import {
  PrepareOfflineResourceStatus,
  PrepareOfflineResourceTier,
} from '../../types/prepareOffline/types';
import {
  manifestEntryToResourceId,
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
} from './offlineDownloadCatalog';

/**
 * Prepare for Offline — mock inventory scenarios (#51 dev QA).
 *
 * **Role:** Defines preset *on-device* states for QA — which resources are
 * already downloaded (`completed`), in progress (`downloading`), or still pending
 * (`selected`). Each scenario is a full map of resource id → status.
 *
 * **Works with:**
 * - `offlineDownloadCatalog.ts` — iterates `MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST` and assigns
 *   statuses via `manifestEntryToResourceId()` so ids always match the catalog.
 * - `offlineDownloadInventoryRuntime.ts` — consumes `buildMockInventoryForScenario()` as the base layer;
 *   applies runtime overrides and pub/sub on top (see that file).
 *
 * **Switch scenario:** set `DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO` below
 * and reload the app. Options: fresh | tier1 | tier1-tier2 |
 * tier1-tier2-tier3-pending | all | mixed
 *
 * **Cumulative tier rule (#201 must honor in production):**
 * Tier N can only be `completed` or `downloading` when every item in tiers 1…N−1
 * is `completed`. Enforced by `normalizeCumulativeTierInventory()`.
 *
 * Invalid edge cases removed: tier2 without Tier 1; tier1-tier3 skipping Tier 2.
 */
export const PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIOS = [
  'fresh',
  'tier1',
  'tier1-tier2',
  'tier1-tier2-tier3-pending',
  'all',
  'mixed',
] as const;

export type PrepareOfflineMockInventoryScenario =
  (typeof PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIOS)[number];

export const PREPARE_OFFLINE_MOCK_SCENARIO_LABELS: Record<
  PrepareOfflineMockInventoryScenario,
  string
> = {
  fresh: 'Fresh device — nothing on device yet',
  tier1: 'Tier 1 on device only (Source Bible)',
  'tier1-tier2': 'Tier 1 + Tier 2 on device (Tier 3 excluded from package)',
  'tier1-tier2-tier3-pending':
    'Tier 1 + 2 on device, Tier 3 pending in package (~66 MB left)',
  all: 'All tiers on device',
  mixed: 'Mid-download — Tier 1–2 done, Words audio downloading, rest pending',
};

/**
 * Dev-only: which on-device inventory scenario to use.
 * Change this value and reload the app to QA different tier combinations.
 *
 * Each scenario controls:
 * 1. Which tiers show as already on device (green check in summary)
 * 2. Which tiers are included in the download package by default (Customize checkboxes)
 *
 * Options: fresh | tier1 | tier1-tier2 | tier1-tier2-tier3-pending | all | mixed
 */
export const DEFAULT_PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIO: PrepareOfflineMockInventoryScenario =
  'mixed';

/** Fixed mid-download state — cumulative: Tier 1 complete, Tier 2 partial, Tier 3 pending. */
export const MOCK_PREPARE_OFFLINE_MIXED_INVENTORY: Record<
  string,
  PrepareOfflineResourceStatus
> = {
  [manifestEntryToResourceId(1, 'Source Bible', 'text')]: 'completed',
  [manifestEntryToResourceId(1, 'Source Bible', 'audio')]: 'completed',
  [manifestEntryToResourceId(2, 'Translation Words', 'text')]: 'completed',
  [manifestEntryToResourceId(2, 'Translation Words', 'audio')]: 'downloading',
  [manifestEntryToResourceId(2, 'Translation Notes', 'text')]: 'selected',
  [manifestEntryToResourceId(2, 'Translation Notes', 'audio')]: 'selected',
  [manifestEntryToResourceId(3, 'Bible Commentary', 'text')]: 'selected',
  [manifestEntryToResourceId(3, 'Bible Commentary', 'audio')]: 'selected',
  [manifestEntryToResourceId(3, 'Reference Images', 'text')]: 'selected',
  [manifestEntryToResourceId(3, 'Alternate Translations', 'text')]: 'selected',
  [manifestEntryToResourceId(3, 'Alternate Translations', 'audio')]: 'selected',
};

function tierItemIds(tier: PrepareOfflineResourceTier): string[] {
  return MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST.filter(
    entry => entry.tier === tier,
  ).map(entry =>
    manifestEntryToResourceId(entry.tier, entry.groupName, entry.kind),
  );
}

function isTierFullyCompleted(
  inventory: Record<string, PrepareOfflineResourceStatus>,
  tier: PrepareOfflineResourceTier,
): boolean {
  const ids = tierItemIds(tier);
  return ids.length > 0 && ids.every(id => inventory[id] === 'completed');
}

const ON_DEVICE_STATUSES = new Set<PrepareOfflineResourceStatus>([
  'completed',
  'downloading',
]);

/**
 * Enforces tier-cumulative on-device inventory: lower tiers must be fully
 * completed before any higher tier can be completed or downloading.
 */
export function normalizeCumulativeTierInventory(
  inventory: Record<string, PrepareOfflineResourceStatus>,
): Record<string, PrepareOfflineResourceStatus> {
  const normalized = { ...inventory };

  const tier1Complete = isTierFullyCompleted(normalized, 1);
  const tier2Complete = tier1Complete && isTierFullyCompleted(normalized, 2);

  for (const entry of MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST) {
    const id = manifestEntryToResourceId(
      entry.tier,
      entry.groupName,
      entry.kind,
    );
    const status = normalized[id];
    if (!status || !ON_DEVICE_STATUSES.has(status)) {
      continue;
    }

    if (entry.tier === 2 && !tier1Complete) {
      normalized[id] = 'selected';
    }

    if (entry.tier === 3 && !tier2Complete) {
      normalized[id] = 'selected';
    }
  }

  return normalized;
}

function tiersOnDeviceForScenario(
  scenario: Exclude<
    PrepareOfflineMockInventoryScenario,
    'fresh' | 'mixed' | 'all'
  >,
): Set<PrepareOfflineResourceTier> {
  switch (scenario) {
    case 'tier1':
      return new Set([1]);
    case 'tier1-tier2':
    case 'tier1-tier2-tier3-pending':
      return new Set([1, 2]);
  }
}

export function isPrepareOfflineMockInventoryScenario(
  value: string,
): value is PrepareOfflineMockInventoryScenario {
  return (
    PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIOS as readonly string[]
  ).includes(value);
}

/** Builds default on-device inventory for a named dev scenario. */
export function buildMockInventoryForScenario(
  scenario: PrepareOfflineMockInventoryScenario,
): Record<string, PrepareOfflineResourceStatus> {
  if (scenario === 'mixed') {
    return normalizeCumulativeTierInventory({
      ...MOCK_PREPARE_OFFLINE_MIXED_INVENTORY,
    });
  }

  const inventory: Record<string, PrepareOfflineResourceStatus> = {};

  for (const entry of MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST) {
    const id = manifestEntryToResourceId(
      entry.tier,
      entry.groupName,
      entry.kind,
    );

    if (scenario === 'fresh') {
      inventory[id] = 'selected';
      continue;
    }

    if (scenario === 'all') {
      inventory[id] = 'completed';
      continue;
    }

    inventory[id] = tiersOnDeviceForScenario(scenario).has(entry.tier)
      ? 'completed'
      : 'selected';
  }

  return normalizeCumulativeTierInventory(inventory);
}

/** Tiers included in the download package by default for each dev scenario. */
export function getTiersIncludedInPackageForScenario(
  scenario: PrepareOfflineMockInventoryScenario,
): Set<PrepareOfflineResourceTier> | null {
  switch (scenario) {
    case 'tier1':
      return new Set([1]);
    case 'tier1-tier2':
      return new Set([1, 2]);
    case 'tier1-tier2-tier3-pending':
    case 'fresh':
    case 'all':
    case 'mixed':
      return null;
  }
}

/** Tier 2/3 item ids to deselect in Customize when a scenario starts. */
export function getDefaultDeselectedItemIdsForScenario(
  scenario: PrepareOfflineMockInventoryScenario,
): Set<string> {
  const includedTiers = getTiersIncludedInPackageForScenario(scenario);
  if (!includedTiers) {
    return new Set();
  }

  const deselected = new Set<string>();

  for (const entry of MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST) {
    if (!includedTiers.has(entry.tier)) {
      deselected.add(
        manifestEntryToResourceId(entry.tier, entry.groupName, entry.kind),
      );
    }
  }

  return deselected;
}
