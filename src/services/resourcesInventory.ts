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
 * Optional #201 queue check: completed download_queue rows for a section's
 * catalog groupName. Prefer prepare-offline status for gating today; queue is
 * a secondary signal when workers have persisted completions.
 */
export async function isResourcesSectionDownloadedInQueue(
  projectId: number,
  sectionId: ResourceSectionId,
): Promise<boolean> {
  const gate = RESOURCES_SECTION_INVENTORY_GATES.find(
    entry => entry.sectionId === sectionId,
  );
  if (!gate) {
    return false;
  }

  try {
    const rows = await getDownloadedResourcesByProject(projectId);
    return rows.some(
      row =>
        row.status === 'completed' &&
        row.resourceName === gate.groupName &&
        row.kind === 'text',
    );
  } catch (error) {
    log.warn('download_queue inventory lookup failed', {
      projectId,
      sectionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
