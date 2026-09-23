import {
  getDownloadedResourceSections,
  getResourcesInventoryStatus,
  isResourcesSectionDownloadedInQueue,
  subscribeResourcesInventory,
} from './resourcesInventory';
import { getDownloadedResourcesByProject } from '../db/downloadQueueRepository';
import {
  clearPrepareOfflineSessionInventory,
  refreshPrepareOfflineInventory,
} from './prepareOfflineResources';
import { manifestEntryToResourceId } from '../utils/prepareOfflineResourceId';

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadedResourcesByProject: jest.fn(async () => [
    {
      status: 'completed',
      resourceName: 'Translation Notes',
      kind: 'text',
    },
  ]),
  // Also consumed by prepareOfflineResources (status cache refresh).
  getDownloadQueueStatusMap: jest.fn(async () => new Map()),
}));

const downloadedRows = getDownloadedResourcesByProject as jest.MockedFunction<
  typeof getDownloadedResourcesByProject
>;

describe('resourcesInventory', () => {
  const projectId = 42;
  const userId = 7;

  beforeEach(() => {
    downloadedRows.mockResolvedValue([
      {
        status: 'completed',
        resourceName: 'Translation Notes',
        kind: 'text',
      },
    ] as never);
    clearPrepareOfflineSessionInventory();
  });

  it('reads status from the queue-backed Prepare Offline inventory', async () => {
    // No inventory refreshed yet → available.
    expect(
      getResourcesInventoryStatus(
        projectId,
        manifestEntryToResourceId(1, 'Translation Notes', 'text'),
      ),
    ).toBe('available');

    await refreshPrepareOfflineInventory(projectId);

    // Still available: nothing in the queue for this project.
    expect(
      getResourcesInventoryStatus(
        projectId,
        manifestEntryToResourceId(1, 'Translation Notes', 'text'),
      ),
    ).toBe('available');
  });

  it('notifies subscribers when the inventory is refreshed', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeResourcesInventory(listener);

    await refreshPrepareOfflineInventory(projectId);

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('checks download_queue for completed section rows', async () => {
    await expect(
      isResourcesSectionDownloadedInQueue(
        projectId,
        userId,
        'translationNotes',
      ),
    ).resolves.toBe(true);
    await expect(
      isResourcesSectionDownloadedInQueue(projectId, userId, 'imagesMaps'),
    ).resolves.toBe(false);
  });

  it('maps persisted download_queue completions to sections', async () => {
    await expect(
      getDownloadedResourceSections(projectId, userId),
    ).resolves.toEqual(['translationNotes']);
  });

  it('returns no sections when the queue lookup fails', async () => {
    downloadedRows.mockRejectedValueOnce(new Error('database not initialized'));
    await expect(
      getDownloadedResourceSections(projectId, userId),
    ).resolves.toEqual([]);
  });
});
