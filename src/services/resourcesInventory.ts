/**
 * Resources tab inventory facade (#192).
 *
 * Reuses Prepare Offline / #201 inventory — not metadata sync.ts and not a
 * parallel Resources sync stack. Callers must not fetch Aquifer/FluentAPI here.
 */
import { getDownloadedResourcesByProject } from '../db/downloadQueueRepository';
import {
  getPrepareOfflineResourceStatus,
  subscribePrepareOfflineInventory,
  type PrepareOfflineInventoryListener,
} from './prepareOfflineResources';
import { PrepareOfflineResourceStatus } from '../types/prepareOffline/types';
import { RESOURCES_SECTION_INVENTORY_GATES } from '../utils/resourcesSectionInventory';
import { ResourceSectionId } from '../types/resources/types';
import { logger } from '../utils/logger';

const log = logger.create('resourcesInventory');

export function getResourcesInventoryStatus(
  projectId: number,
  resourceId: string,
): PrepareOfflineResourceStatus {
  return getPrepareOfflineResourceStatus(projectId, resourceId);
}

export function subscribeResourcesInventory(
  listener: PrepareOfflineInventoryListener,
): () => void {
  return subscribePrepareOfflineInventory(listener);
}

/**
 * Sections whose #201 `download_queue` rows are persisted as completed.
 *
 * This is the durable on-device signal: `getPrepareOfflineResourceStatus()` is
 * mock-backed in dev and has no production inventory yet, so a shipped build
 * would otherwise hide every section after a successful download.
 */
export async function getDownloadedResourceSections(
  projectId: number,
): Promise<ResourceSectionId[]> {
  try {
    const rows = await getDownloadedResourcesByProject(projectId);
    return RESOURCES_SECTION_INVENTORY_GATES.filter(gate =>
      rows.some(
        row =>
          row.status === 'completed' &&
          row.resourceName === gate.groupName &&
          row.kind === 'text',
      ),
    ).map(gate => gate.sectionId);
  } catch (error) {
    log.warn('download_queue inventory lookup failed', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function isResourcesSectionDownloadedInQueue(
  projectId: number,
  sectionId: ResourceSectionId,
): Promise<boolean> {
  const sections = await getDownloadedResourceSections(projectId);
  return sections.includes(sectionId);
}
