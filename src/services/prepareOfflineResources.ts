/**
 * Prepare for Offline — data access layer (#51 / #201).
 *
 * Single entry point for manifest and on-device inventory. UI, catalog builder,
 * and download service import from here — never from `src/mocks/prepareOffline/`.
 *
 * Today: mock catalog + inventory until FluentAPI manifest is wired (#201 follow-up).
 * Replace internals here when the API contract lands; callers stay unchanged.
 */
import {
  clearMockPrepareOfflineRuntimeInventory,
  getDefaultDeselectedItemIdsForScenario,
  getMockPrepareOfflineResourceStatus,
  getPrepareOfflineMockInventoryScenario,
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
  simulateMockPrepareOfflineDownload,
  subscribeMockPrepareOfflineInventory,
} from '../mocks/prepareOffline';
import {
  PrepareOfflineResourceManifestEntry,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';
import { unscopedPrepareOfflineResourceId } from '../utils/prepareOfflineResourceId';

export type PrepareOfflineInventoryListener = () => void;

/** Mock manifest until FluentAPI resource manifest is available. */
export async function fetchPrepareOfflineManifest(
  projectId: number,
): Promise<PrepareOfflineResourceManifestEntry[]> {
  void projectId;
  return MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST;
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

/** Reset runtime inventory overrides when project/user session changes. */
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
