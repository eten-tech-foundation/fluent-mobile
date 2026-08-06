import {
  getResourcesInventoryStatus,
  isResourcesSectionDownloadedInQueue,
  subscribeResourcesInventory,
} from './resourcesInventory';
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

  it('optionally checks download_queue for completed section rows', async () => {
    await expect(
      isResourcesSectionDownloadedInQueue(projectId, 'translationNotes'),
    ).resolves.toBe(true);
    await expect(
      isResourcesSectionDownloadedInQueue(projectId, 'imagesMaps'),
    ).resolves.toBe(false);
  });
});
