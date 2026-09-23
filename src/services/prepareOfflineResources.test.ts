import { FluentAPI } from './api';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  fetchSourceBibleAudioManifest,
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
  FluentAPI: {
    getPrepareOfflineManifest: jest.fn(),
    getSourceAudioManifest: jest.fn(),
    getChapterSourceAudio: jest.fn(),
  },
}));

const FULL_PARAMS = {
  languageCode: 'eng',
  bookCode: 'MRK',
  startChapter: 1,
  endChapter: 3,
  bibleId: 10,
};

function mockSourceAudioManifest(
  items: unknown[],
  overrides: Record<string, unknown> = {},
) {
  (FluentAPI.getSourceAudioManifest as jest.Mock).mockResolvedValue({
    projectId: 99,
    sourceLanguageCode: 'eng',
    provider: 'aquifer',
    items,
    totalBytes: 0,
    ...overrides,
  });
}

describe('prepareOfflineResources', () => {
  beforeEach(() => {
    resetMockPrepareOfflineInventory();
    jest.clearAllMocks();
  });

  describe('fetchPrepareOfflineManifest', () => {
    it('maps API items and calls both manifests with the given params', async () => {
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
      mockSourceAudioManifest([]);

      const { bibleId, ...translationResourcesParams } = FULL_PARAMS;
      void bibleId;

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledWith(99, {
        languageCode: 'eng',
        bookCode: 'MRK',
        startChapter: 1,
        endChapter: 3,
      });
      expect(FluentAPI.getSourceAudioManifest).toHaveBeenCalledWith(99, {
        languageCode: 'eng',
        bookCode: 'MRK',
        startChapter: 1,
        endChapter: 3,
        bibleId: 10,
      });
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
      mockSourceAudioManifest([]);

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      expect(result[0].tier).toBe(1);
    });

    it('merges source-audio manifest items mapped to mobile shape', async () => {
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockResolvedValue({
        projectId: 99,
        sourceLanguageCode: 'eng',
        items: [],
        totalBytes: 0,
        truncated: false,
      });
      mockSourceAudioManifest([
        {
          id: 'sa1',
          tier: 1,
          kind: 'audio',
          resourceName: 'Source Bible',
          label: 'Audio',
          required: true,
          removable: false,
          bytesTotal: 8_945_229,
          sourceUrl: 'https://example.com/mrk1.mp3',
          fileExt: 'mp3',
          languageCode: 'eng',
          bookCode: 'MRK',
          startChapter: 1,
          endChapter: 3,
          provider: 'aquifer',
        },
      ]);

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'sa1',
        tier: 1,
        kind: 'audio',
        sourceUrl: 'https://example.com/mrk1.mp3',
      });
      expect(FluentAPI.getChapterSourceAudio).not.toHaveBeenCalled();
    });

    it('falls back to per-chapter source-audio when the manifest returns nothing', async () => {
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockResolvedValue({
        projectId: 99,
        sourceLanguageCode: 'eng',
        items: [],
        totalBytes: 0,
        truncated: false,
      });
      mockSourceAudioManifest([]);
      (FluentAPI.getChapterSourceAudio as jest.Mock).mockImplementation(
        (_projectId: number, ...rest: unknown[]) => {
          void rest;
          return Promise.resolve({
            provider: 'dbl',
            bible: { name: 'B', abbreviation: 'ENG', fluentBibleId: 10 },
            bookCode: 'MRK',
            chapter: 1,
            items: [
              {
                format: 'mp3',
                url: 'https://example.com/ch1.mp3',
                sizeBytes: 1234,
                scope: 'chapter',
              },
            ],
          });
        },
      );

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      // One call per chapter in the 1–3 range.
      expect(FluentAPI.getChapterSourceAudio).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        id: 'source-bible-audio-MRK-1',
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        bytesTotal: 1234,
        sourceUrl: 'https://example.com/ch1.mp3',
        fileExt: 'mp3',
      });
    });
  });

  describe('fetchSourceBibleAudioManifest', () => {
    it('maps one manifest item per chapter with audio, skipping empty responses', async () => {
      (FluentAPI.getChapterSourceAudio as jest.Mock).mockImplementation(
        (_projectId: number, params: { bookCode: string; chapter: number }) => {
          void params;
          return Promise.resolve({
            provider: 'dbl',
            bible: { name: 'B', abbreviation: 'ENG' },
            bookCode: 'MRK',
            chapter: 1,
            items: [],
          });
        },
      );

      const result = await fetchSourceBibleAudioManifest(
        99,
        [
          { bookCode: 'MRK', chapterNumber: 1 },
          { bookCode: 'MRK', chapterNumber: 2 },
        ],
        'eng',
        10,
      );

      expect(FluentAPI.getChapterSourceAudio).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
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
    it('returns an empty set — all tiers checked by default (#504)', () => {
      expect(getDefaultPrepareOfflinePackageDeselects(null).size).toBe(0);
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
