import * as FileSystem from 'expo-file-system/legacy';
import { getProjectNamesByIds } from '../db/queries.prepareOffline';
import { deleteDownloadItem } from '../db/repository';
import type {
  DeviceStorageSummary,
  DeleteDownloadResourcesResult,
  OtherProjectStorageGroup,
  StorageInventoryResource,
} from '../types/prepareOffline/types';
import { logger } from '../utils/logger';
import { getVerifiedDownloadedResourcesInventory } from './downloadInventory';
import { deleteDownloadResourceFile } from './downloadStorage';
import { getActiveUserId } from './storage';

const log = logger.create('PrepareOfflineStorage');

const UNAVAILABLE_STORAGE_LABEL = null;

async function getAvailableDeviceBytes(): Promise<number | null> {
  const getFreeDiskStorageAsync = (
    FileSystem as {
      getFreeDiskStorageAsync?: () => Promise<number>;
    }
  ).getFreeDiskStorageAsync;

  if (!getFreeDiskStorageAsync) {
    return UNAVAILABLE_STORAGE_LABEL;
  }

  try {
    const bytes = await getFreeDiskStorageAsync();
    return Number.isFinite(bytes) && bytes >= 0
      ? bytes
      : UNAVAILABLE_STORAGE_LABEL;
  } catch (error) {
    log.warn('Unable to read available device storage', { error });
    return UNAVAILABLE_STORAGE_LABEL;
  }
}

async function getTotalDeviceBytes(): Promise<number | null> {
  const getTotalDiskCapacityAsync = (
    FileSystem as {
      getTotalDiskCapacityAsync?: () => Promise<number>;
    }
  ).getTotalDiskCapacityAsync;

  if (!getTotalDiskCapacityAsync) {
    return UNAVAILABLE_STORAGE_LABEL;
  }

  try {
    const bytes = await getTotalDiskCapacityAsync();
    return Number.isFinite(bytes) && bytes >= 0
      ? bytes
      : UNAVAILABLE_STORAGE_LABEL;
  } catch (error) {
    log.warn('Unable to read total device storage', { error });
    return UNAVAILABLE_STORAGE_LABEL;
  }
}

function parseActiveUserId(): number | null {
  const userId = Number(getActiveUserId());
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}

function mapResource(item: {
  id: string;
  projectId?: number;
  userId?: number;
  label: string;
  resourceName?: string;
  kind?: 'text' | 'audio' | 'image';
  bytesTotal?: number;
  localFilePath?: string;
}): StorageInventoryResource | null {
  if (item.projectId === undefined) {
    return null;
  }

  return {
    id: item.id,
    projectId: item.projectId,
    userId: item.userId,
    label: item.label,
    resourceName: item.resourceName?.trim() || item.label,
    kind: item.kind ?? 'text',
    bytes: item.bytesTotal ?? 0,
    localFilePath: item.localFilePath,
  };
}

export async function getDeviceStorageSummary(): Promise<DeviceStorageSummary> {
  const inventory = await getVerifiedDownloadedResourcesInventory();
  const fluentUsedBytes = inventory.reduce(
    (sum, project) => sum + project.totalBytes,
    0,
  );
  const [availableBytes, totalDeviceBytes] = await Promise.all([
    getAvailableDeviceBytes(),
    getTotalDeviceBytes(),
  ]);

  return { availableBytes, totalDeviceBytes, fluentUsedBytes };
}

export async function getOtherProjectsStorageInventory(
  currentProjectId: number,
): Promise<OtherProjectStorageGroup[]> {
  const inventory = await getVerifiedDownloadedResourcesInventory();
  const otherProjects = inventory.filter(
    project => project.projectId !== currentProjectId,
  );

  if (otherProjects.length === 0) {
    return [];
  }

  const nameById = await getProjectNamesByIds(
    otherProjects.map(project => project.projectId),
  );

  return otherProjects.map(project => {
    const resources = project.resources
      .map(mapResource)
      .filter((resource): resource is StorageInventoryResource =>
        Boolean(resource),
      );

    return {
      projectId: project.projectId,
      projectName:
        nameById.get(project.projectId) ?? `Project ${project.projectId}`,
      totalBytes: resources.reduce((sum, resource) => sum + resource.bytes, 0),
      resources,
    };
  });
}

export async function deleteSelectedDownloadResources(
  resources: StorageInventoryResource[],
  currentProjectId: number,
): Promise<DeleteDownloadResourcesResult> {
  const deletedIds: string[] = [];
  const failed: DeleteDownloadResourcesResult['failed'] = [];
  const activeUserId = parseActiveUserId();

  for (const resource of resources) {
    if (resource.projectId === currentProjectId) {
      failed.push({ id: resource.id, reason: 'Cannot delete current project' });
      continue;
    }

    if (
      activeUserId === null ||
      (resource.userId !== undefined && resource.userId !== activeUserId)
    ) {
      failed.push({
        id: resource.id,
        reason: 'Not owned by active account',
      });
      continue;
    }

    try {
      if (resource.localFilePath) {
        await deleteDownloadResourceFile(
          resource.projectId,
          resource.localFilePath,
        );
      }
      await deleteDownloadItem(resource.id);
      deletedIds.push(resource.id);

      log.info('Deleted offline resource', {
        projectId: resource.projectId,
        resourceId: resource.id,
        bytes: resource.bytes,
      });
    } catch (error) {
      failed.push({
        id: resource.id,
        reason: error instanceof Error ? error.message : String(error),
      });
      log.error('Failed to delete offline resource', {
        projectId: resource.projectId,
        resourceId: resource.id,
        error,
      });
    }
  }

  if (deletedIds.length > 0) {
    const bytesByProject = new Map<number, number>();
    for (const resource of resources) {
      if (!deletedIds.includes(resource.id)) continue;
      bytesByProject.set(
        resource.projectId,
        (bytesByProject.get(resource.projectId) ?? 0) + resource.bytes,
      );
    }
    for (const [projectId, bytes] of bytesByProject.entries()) {
      log.info('Offline storage delete summary', {
        projectId,
        deletedCount: resources.filter(
          resource =>
            deletedIds.includes(resource.id) &&
            resource.projectId === projectId,
        ).length,
        deletedBytes: bytes,
      });
    }
  }

  return { deletedIds, failed };
}
