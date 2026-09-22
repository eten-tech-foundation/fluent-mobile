import { FluentAPI } from './api';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  simulatePrepareOfflineDownloadProgress,
  subscribePrepareOfflineInventory,
} from './prepareOfflineResources';
import {
  manifestEntryToResourceId,
  resetMockPrepareOfflineInventory,
  setMockPrepareOfflineResourceStatus,
  setPrepareOfflineMockInventoryScenario,
} from '../mocks/prepareOffline';

jest.mock('./api', () => ({
  FluentAPI: { getPrepareOfflineManifest: jest.fn() },
}));

describe('prepareOfflineResources', () => {
  beforeEach(() => {
    resetMockPrepareOfflineInventory();
    jest.clearAllMocks();
  });

  describe('fetchPrepareOfflineManifest', () => {
    const params = {
      languageCode: 'eng',
      bookCode: 'MRK',
      startChapter: 1,
      endChapter: 3,
    };

    it('maps API items and calls FluentAPI with the given params', async () => {
      const apiItem = {
        id: 'r1',
        tier: 3 as const,
        kind: 'text' as const,
        resourceName: 'Bible Commentary',
        label: 'Commentary',
        required: false,
        removable: true,
        bytesTotal: 1024,
        fileExt: 'json',
        languageCode: 'eng',
      };
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockResolvedValue({
        projectId: 99,
        sourceLanguageCode: 'eng',
        items: [apiItem],
        totalBytes: 1024,
        truncated: false,
      });

      const result = await fetchPrepareOfflineManifest(99, params);

      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledWith(
        99,
        params,
      );
      expect(result).toEqual([apiItem]);
    });

    it('overrides Translation Notes to Tier 1 regardless of API tier', async () => {
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockResolvedValue({
        projectId: 99,
        sourceLanguageCode: 'eng',
        items: [
          {
            id: 'tn1',
            tier: 2,
            kind: 'text',
            resourceName: 'Translation Notes',
            label: 'Translation Notes',
            required: true,
            removable: false,
            bytesTotal: 512,
            fileExt: 'json',
            languageCode: 'eng',
            collectionCode: 'UWTranslationNotes',
          },
        ],
        totalBytes: 512,
        truncated: false,
      });

      const result = await fetchPrepareOfflineManifest(99, params);

      expect(result[0].tier).toBe(1);
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
