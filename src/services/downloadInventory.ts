import { getDownloadedResourcesInventory } from '../db/repository';
import type {
  DownloadedProjectInventory,
  DownloadQueueItem,
} from '../types/download/types';
import { getActiveUserId } from './storage';
import { fileSize } from './downloadStorage';

async function refreshResourceSize(
  resource: DownloadQueueItem,
): Promise<DownloadQueueItem | undefined> {
  if (!resource.localFilePath) {
    return undefined;
  }

  const size = await fileSize(resource.localFilePath);
  if (size === undefined) {
    return undefined;
  }

  return { ...resource, bytesTotal: size };
}

export async function getVerifiedDownloadedResourcesInventory(): Promise<
  DownloadedProjectInventory[]
> {
  const userId = Number(getActiveUserId());
  if (!Number.isFinite(userId) || userId <= 0) {
    return [];
  }

  const inventory = await getDownloadedResourcesInventory(userId);
  const verified: DownloadedProjectInventory[] = [];

  for (const project of inventory) {
    const resources = (
      await Promise.all(project.resources.map(refreshResourceSize))
    ).filter((resource): resource is DownloadQueueItem => Boolean(resource));

    if (resources.length === 0) {
      continue;
    }

    verified.push({
      projectId: project.projectId,
      resources,
      totalBytes: resources.reduce(
        (sum, resource) => sum + (resource.bytesTotal ?? 0),
        0,
      ),
    });
  }

  return verified;
}
