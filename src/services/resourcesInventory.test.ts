import {
  getDownloadedResourceSections,
  getResourcesInventoryStatus,
  isResourcesSectionDownloadedInQueue,
  subscribeResourcesInventory,
} from './resourcesInventory';
import { getDownloadedResourcesByProject } from '../db/downloadQueueRepository';
import {
  clearMockPrepareOfflineRuntimeInventory,
  setPrepareOfflineMockInventoryScenario,
} from '../mocks/prepareOffline';
import { manifestEntryToResourceId } from '../utils/prepareOfflineResourceId';

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadedResourcesByProject: jest.fn(async () => [
    {
      status: 'completed',
      resourceName: 'Translation Notes',
      kind: 'text',
    },
  ]),
}));

describe('resourcesInventory', () => {
  const projectId = 42;
  const userId = 7;

  beforeEach(() => {
    clearMockPrepareOfflineRuntimeInventory();
    setPrepareOfflineMockInventoryScenario('fresh');
  });

  it('reads status from Prepare Offline inventory (no Aquifer/FluentAPI)', () => {
    setPrepareOfflineMockInventoryScenario('tier1');
    const tnId = manifestEntryToResourceId(1, 'Translation Notes', 'text');
    expect(getResourcesInventoryStatus(projectId, tnId)).toBe('completed');

    const tqId = manifestEntryToResourceId(2, 'Translation Questions', 'text');
    expect(getResourcesInventoryStatus(projectId, tqId)).not.toBe('completed');
  });

  it('notifies subscribers when inventory scenario changes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeResourcesInventory(listener);
    setPrepareOfflineMockInventoryScenario('all');
    expect(listener).toHaveBeenCalled();
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
    (getDownloadedResourcesByProject as jest.Mock).mockRejectedValueOnce(
      new Error('database not initialized'),
    );
    await expect(
      getDownloadedResourceSections(projectId, userId),
    ).resolves.toEqual([]);
  });
});
