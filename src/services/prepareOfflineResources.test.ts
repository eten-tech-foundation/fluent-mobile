import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  simulatePrepareOfflineDownloadProgress,
  subscribePrepareOfflineInventory,
} from './prepareOfflineResources';
import {
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
  manifestEntryToResourceId,
  resetMockPrepareOfflineInventory,
  setMockPrepareOfflineResourceStatus,
  setPrepareOfflineMockInventoryScenario,
} from '../mocks/prepareOffline';

describe('prepareOfflineResources', () => {
  beforeEach(() => {
    resetMockPrepareOfflineInventory();
  });

  describe('fetchPrepareOfflineManifest', () => {
    it('returns the mock manifest regardless of project id', async () => {
      await expect(fetchPrepareOfflineManifest(99)).resolves.toBe(
        MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
      );
    });
  });

  describe('getPrepareOfflineResourceStatus', () => {
    it('resolves project-scoped resource ids against mock inventory', () => {
      setPrepareOfflineMockInventoryScenario('mixed');
      const scopedId = `5-${manifestEntryToResourceId(
        1,
        'Source Bible',
        'text',
      )}`;

      expect(getPrepareOfflineResourceStatus(5, scopedId)).toBe('completed');
    });

    it('returns selected for unknown resources', () => {
      expect(getPrepareOfflineResourceStatus(1, 'missing-resource')).toBe(
        'selected',
      );
    });
  });

  describe('getDefaultPrepareOfflinePackageDeselects', () => {
    beforeEach(() => {
      setPrepareOfflineMockInventoryScenario('tier1');
    });

    it('returns unscoped ids when projectId is null', () => {
      const deselects = getDefaultPrepareOfflinePackageDeselects(null);

      expect(deselects.size).toBeGreaterThan(0);
      expect([...deselects].every(id => !/^\d+-/.test(id))).toBe(true);
    });

    it('prefixes ids with projectId when provided', () => {
      const deselects = getDefaultPrepareOfflinePackageDeselects(5);

      expect(deselects.size).toBeGreaterThan(0);
      expect([...deselects].every(id => id.startsWith('5-'))).toBe(true);
    });

    it('returns an empty set when the scenario includes every tier', () => {
      setPrepareOfflineMockInventoryScenario('fresh');

      expect(getDefaultPrepareOfflinePackageDeselects(5).size).toBe(0);
    });
  });

  describe('clearPrepareOfflineSessionInventory', () => {
    it('clears runtime inventory overrides', () => {
      const resourceId = manifestEntryToResourceId(1, 'Source Bible', 'text');
      setMockPrepareOfflineResourceStatus(3, resourceId, 'completed');

      clearPrepareOfflineSessionInventory();

      expect(getPrepareOfflineResourceStatus(3, resourceId)).toBe('selected');
    });
  });

  describe('subscribePrepareOfflineInventory', () => {
    it('notifies listeners when inventory changes', () => {
      const listener = jest.fn();
      const unsubscribe = subscribePrepareOfflineInventory(listener);

      simulatePrepareOfflineDownloadProgress(3, [
        manifestEntryToResourceId(1, 'Source Bible', 'text'),
      ]);

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });
  });
});
