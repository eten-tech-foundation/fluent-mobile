/**
 * Prepare for Offline — data access layer (#51 / #201).
 *
 * Single entry point for manifest and on-device inventory. UI, catalog builder,
 * and download service import from here — never from `src/mocks/prepareOffline/`.
 *
 * Today: async "fetch" resolves to mock data in `__DEV__`.
 * #201: replace internals with FluentAPI + SQLite inventory without changing callers.
 *
 * Bundle note: mock modules are imported statically but all call sites are
 * guarded by `__DEV__`; production runtime never executes mock code. #201 removes
 * mock imports entirely when FluentAPI replaces this layer.
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
import { logger } from '../utils/logger';
import { unscopedPrepareOfflineResourceId } from '../utils/prepareOfflineResourceId';

const log = logger.create('prepareOfflineResources');

export type PrepareOfflineInventoryListener = () => void;

/** Simulates FluentAPI manifest fetch. Dev: mock manifest; prod: empty until #201. */
export async function fetchPrepareOfflineManifest(
  projectId: number,
): Promise<PrepareOfflineResourceManifestEntry[]> {
  if (__DEV__) {
    void projectId;
    return MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST;
  }

  log.warn('Prepare offline manifest unavailable — #201 not implemented', {
    projectId,
  });
  return [];
}

/** On-device / in-flight status for one resource row. */
export function getPrepareOfflineResourceStatus(
  projectId: number,
  resourceId: string,
): PrepareOfflineResourceStatus {
  if (__DEV__) {
    return getMockPrepareOfflineResourceStatus(
      projectId,
      unscopedPrepareOfflineResourceId(projectId, resourceId),
    );
  }

  return 'selected';
}

/** Subscribe to inventory changes (mock pub/sub in dev; queue events in #201). */
export function subscribePrepareOfflineInventory(
  listener: PrepareOfflineInventoryListener,
): () => void {
  if (__DEV__) {
    return subscribeMockPrepareOfflineInventory(listener);
  }

  return () => {};
}

/** Reset runtime inventory overrides when project/user session changes. */
export function clearPrepareOfflineSessionInventory(): void {
  if (__DEV__) {
    clearMockPrepareOfflineRuntimeInventory();
  }
}

/** Tier 2/3 ids deselected by default for the active dev scenario package. */
export function getDefaultPrepareOfflinePackageDeselects(
  projectId: number | null = null,
): Set<string> {
  if (__DEV__) {
    const ids = getDefaultDeselectedItemIdsForScenario(
      getPrepareOfflineMockInventoryScenario(),
    );
    if (projectId === null) {
      return ids;
    }
    return new Set([...ids].map(id => `${projectId}-${id}`));
  }

  return new Set();
}

/** Dev-only stand-in for #201 worker progress after enqueue. */
export function simulatePrepareOfflineDownloadProgress(
  projectId: number,
  resourceIdsInTierOrder: string[],
): void {
  if (__DEV__) {
    simulateMockPrepareOfflineDownload(projectId, resourceIdsInTierOrder);
  }
}
