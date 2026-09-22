/**
 * Prepare for Offline — data access layer (#51 / #201 / #504).
 *
 * Single entry point for manifest and on-device inventory. UI, catalog builder,
 * and download service import from here — never from `src/mocks/prepareOffline/`.
 *
 * Manifest: wired to the real FluentAPI translation-resources manifest (#504).
 * Inventory/status/simulation: still mock-backed until #201's real worker lands —
 * the API only replaces the manifest source, not the download/inventory architecture.
 */
import { FluentAPI } from './api';
import {
  clearMockPrepareOfflineRuntimeInventory,
  getDefaultDeselectedItemIdsForScenario,
  getMockPrepareOfflineResourceStatus,
  getPrepareOfflineMockInventoryScenario,
  simulateMockPrepareOfflineDownload,
  subscribeMockPrepareOfflineInventory,
} from '../mocks/prepareOffline';
import type { ApiPrepareOfflineManifestItem } from '../types/api/translationResources';
import {
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';
import { unscopedPrepareOfflineResourceId } from '../utils/prepareOfflineResourceId';

export type PrepareOfflineInventoryListener = () => void;

/** Fluent API manifest resources whose tier mobile overrides regardless of server value. */
const TIER_OVERRIDE_BY_COLLECTION_CODE: Record<string, 1 | 2 | 3> = {
  // Translation Notes ships under Tier 2 server-side; mobile UI treats it as Tier 1.
  UWTranslationNotes: 1,
};

function toMobileManifestItem(
  apiItem: ApiPrepareOfflineManifestItem,
): PrepareOfflineResourceManifestItem {
  const tierOverride = apiItem.collectionCode
    ? TIER_OVERRIDE_BY_COLLECTION_CODE[apiItem.collectionCode]
    : undefined;

  return {
    ...apiItem,
    tier: tierOverride ?? apiItem.tier,
  };
}

export interface FetchPrepareOfflineManifestParams {
  languageCode: string;
  bookCode: string;
  startChapter: number;
  endChapter: number;
}

/** Real FluentAPI Prepare Offline resource manifest (#504). */
export async function fetchPrepareOfflineManifest(
  projectId: number,
  params: FetchPrepareOfflineManifestParams,
): Promise<PrepareOfflineResourceManifestItem[]> {
  const response = await FluentAPI.getPrepareOfflineManifest(projectId, params);

  if (response.truncated) {
    // Open question (#504): decide surfaced UX for truncated manifests.
    // For now, don't silently treat it as complete — at least log it.
    console.warn(
      `[prepareOfflineResources] manifest truncated for project ${projectId}`,
    );
  }

  return response.items.map(toMobileManifestItem);
}

/** On-device / in-flight status for one resource row. */
export function getPrepareOfflineResourceStatus(
  projectId: number,
  resourceId: string,
): PrepareOfflineResourceStatus {
  return getMockPrepareOfflineResourceStatus(
    projectId,
    unscopedPrepareOfflineResourceId(projectId, resourceId),
  );
}

/** Subscribe to inventory changes (mock pub/sub today; queue events when API lands). */
export function subscribePrepareOfflineInventory(
  listener: PrepareOfflineInventoryListener,
): () => void {
  return subscribeMockPrepareOfflineInventory(listener);
}

/**
 * Clear runtime inventory overrides (tests / explicit reset).
 * Do not call on Prepare Offline remount — completed downloads must survive
 * navigation so Resources can read the same in-session inventory.
 */
export function clearPrepareOfflineSessionInventory(): void {
  clearMockPrepareOfflineRuntimeInventory();
}

/** Tier 2/3 ids deselected by default for the active mock scenario package. */
export function getDefaultPrepareOfflinePackageDeselects(
  projectId: number | null = null,
): Set<string> {
  const ids = getDefaultDeselectedItemIdsForScenario(
    getPrepareOfflineMockInventoryScenario(),
  );
  if (projectId === null) {
    return ids;
  }
  return new Set([...ids].map(id => `${projectId}-${id}`));
}

/** Stand-in for worker progress when enqueue falls back to mock simulation. */
export function simulatePrepareOfflineDownloadProgress(
  projectId: number,
  resourceIdsInTierOrder: string[],
): void {
  simulateMockPrepareOfflineDownload(projectId, resourceIdsInTierOrder);
}
