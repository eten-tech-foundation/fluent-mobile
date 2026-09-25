import { FluentAPI } from './api';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  fetchSourceBibleAudioManifest,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  hydratePrepareOfflineTextContent,
  refreshPrepareOfflineInventory,
  subscribePrepareOfflineInventory,
} from './prepareOfflineResources';
import { getDownloadQueueStatusMap } from '../db/downloadQueueRepository';
import type { DownloadQueueStatus } from '../types/download/types';
import type { PrepareOfflineResourceItem } from '../types/prepareOffline/types';

jest.mock('./api', () => ({
  FluentAPI: {
    getPrepareOfflineManifest: jest.fn(),
    getSourceAudioManifest: jest.fn(),
    getChapterSourceAudio: jest.fn(),
  },
}));

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadQueueStatusMap: jest.fn(),
}));

const getQueueStatusMap = getDownloadQueueStatusMap as jest.MockedFunction<
  typeof getDownloadQueueStatusMap
>;

const USER_A = 1;
const USER_B = 2;

const FULL_PARAMS = {
  languageCode: 'eng',
  bookCode: 'MRK',
  bookId: 20,
  startChapter: 1,
  endChapter: 3,
  bibleId: 10,
};

function mockTranslationManifest(items: unknown[] = []) {
  (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockResolvedValue({
    projectId: 99,
    sourceLanguageCode: 'eng',
    items,
    totalBytes: 0,
    truncated: false,
  });
}

function mockSourceAudioManifest(items: unknown[] = []) {
  (FluentAPI.getSourceAudioManifest as jest.Mock).mockResolvedValue({
    projectId: 99,
    sourceLanguageCode: 'eng',
    provider: 'aquifer',
    items,
    totalBytes: 0,
  });
}

/** Per-chapter audio fallback returns no audio (keeps tests quiet). */
function mockEmptyChapterAudio() {
  (FluentAPI.getChapterSourceAudio as jest.Mock).mockResolvedValue({
    provider: 'dbl',
    bible: { name: 'B', abbreviation: 'ENG' },
    bookCode: 'MRK',
    chapter: 1,
    items: [],
  });
}

describe('prepareOfflineResources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrepareOfflineSessionInventory();
    getQueueStatusMap.mockResolvedValue(new Map());
  });

  describe('fetchPrepareOfflineManifest', () => {
    it('merges source audio and translation resources in order', async () => {
      const translationItem = {
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
      mockTranslationManifest([translationItem]);
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
          sourceUrl: 'https://example.com/mrk.mp3',
          fileExt: 'mp3',
          languageCode: 'eng',
          bookCode: 'MRK',
          startChapter: 1,
          endChapter: 3,
        },
      ]);

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledWith(99, {
        languageCode: 'eng',
        bookCode: 'MRK',
        startChapter: 1,
        endChapter: 3,
      });
      expect(FluentAPI.getSourceAudioManifest).toHaveBeenCalledWith(
        99,
        FULL_PARAMS,
      );
      // Source Bible text is handled by sync, never by the manifest.
      expect(result.map(item => item.id)).toEqual(['sa1', 'r1']);
    });

    it('overrides Translation Notes to Tier 1 regardless of API tier', async () => {
      mockTranslationManifest([
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
      ]);
      mockSourceAudioManifest([]);
      mockEmptyChapterAudio();

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      const tnItem = result.find(item => item.id === 'tn1');
      expect(tnItem?.tier).toBe(1);
    });

    it('falls back to per-chapter source-audio when the manifest returns nothing', async () => {
      mockTranslationManifest([]);
      mockSourceAudioManifest([]);
      (FluentAPI.getChapterSourceAudio as jest.Mock).mockImplementation(
        (params: { bookCode: string; chapter: number }) =>
          Promise.resolve({
            provider: 'dbl',
            bible: { name: 'B', abbreviation: 'ENG' },
            bookCode: params.bookCode,
            chapter: params.chapter,
            items: [
              {
                format: 'mp3',
                url: `https://example.com/ch${params.chapter}.mp3`,
                sizeBytes: 1234,
                scope: 'chapter',
              },
            ],
          }),
      );

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      // One call per chapter in the 1–3 range.
      expect(FluentAPI.getChapterSourceAudio).toHaveBeenCalledTimes(3);
      expect(result.filter(item => item.kind === 'audio')).toHaveLength(3);
      expect(result.find(item => item.kind === 'audio')).toMatchObject({
        id: 'source-bible-audio-MRK-1',
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible',
        bytesTotal: 1234,
        sourceUrl: 'https://example.com/ch1.mp3',
        fileExt: 'mp3',
      });
    });

    it('keeps the rest of the package when the audio fallback fails', async () => {
      const translationItem = {
        id: 'r1',
        tier: 2 as const,
        kind: 'text' as const,
        resourceName: 'Translation Words',
        label: 'Text',
        required: false,
        removable: true,
        bytesTotal: 512,
        fileExt: 'json',
        languageCode: 'eng',
      };
      mockTranslationManifest([translationItem]);
      mockSourceAudioManifest([]);
      (FluentAPI.getChapterSourceAudio as jest.Mock).mockRejectedValue(
        new Error('network down'),
      );

      const result = await fetchPrepareOfflineManifest(99, FULL_PARAMS);

      expect(result).toEqual([translationItem]);
    });
  });

  describe('hydratePrepareOfflineTextContent', () => {
    function textRow(
      status: PrepareOfflineResourceItem['status'],
      memberIds: string[],
    ): PrepareOfflineResourceItem {
      return {
        id: 'Translation Words:text',
        tier: 2,
        kind: 'text',
        groupName: 'Translation Words',
        label: 'Text',
        bytes: 100,
        status,
        required: false,
        removable: true,
        manifestMembers: memberIds.map(id => ({
          id,
          tier: 2 as const,
          kind: 'text' as const,
          resourceName: 'Translation Words',
          label: 'Text',
          required: false,
          removable: true,
          bytesTotal: 50,
          fileExt: 'json',
          languageCode: 'eng',
        })),
      };
    }

    it('copies serializedContent onto matching members', async () => {
      mockTranslationManifest([
        { id: 'tw1', serializedContent: '{"a":1}' },
        { id: 'tw2', serializedContent: '{"b":2}' },
      ]);

      const result = await hydratePrepareOfflineTextContent(
        99,
        [textRow('available', ['tw1', 'tw2'])],
        [FULL_PARAMS],
      );

      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledWith(99, {
        languageCode: 'eng',
        bookCode: 'MRK',
        startChapter: 1,
        endChapter: 3,
        includeContent: true,
      });
      expect(
        result[0].manifestMembers.map(member => member.serializedContent),
      ).toEqual(['{"a":1}', '{"b":2}']);
    });

    it('throws when the server returns no content for a member', async () => {
      mockTranslationManifest([{ id: 'tw1', serializedContent: '{"a":1}' }]);

      await expect(
        hydratePrepareOfflineTextContent(
          99,
          [textRow('available', ['tw1', 'tw2'])],
          [FULL_PARAMS],
        ),
      ).rejects.toThrow('No content returned for text item tw2');
    });

    it('skips completed rows and makes no API call when nothing needs content', async () => {
      const items = [textRow('completed', ['tw1'])];

      const result = await hydratePrepareOfflineTextContent(99, items, [
        FULL_PARAMS,
      ]);

      expect(FluentAPI.getPrepareOfflineManifest).not.toHaveBeenCalled();
      expect(result).toEqual(items);
    });
  });

  describe('fetchSourceBibleAudioManifest', () => {
    it('maps one manifest item per chapter with audio, skipping empty responses', async () => {
      (FluentAPI.getChapterSourceAudio as jest.Mock).mockImplementation(
        (params: { bookCode: string; chapter: number }) =>
          Promise.resolve({
            provider: 'dbl',
            bible: { name: 'B', abbreviation: 'ENG' },
            bookCode: params.bookCode,
            chapter: params.chapter,
            items: [],
          }),
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
    it('maps download_queue statuses to resource statuses after refresh', async () => {
      const queueStatuses = new Map<string, DownloadQueueStatus>([
        ['item-completed', 'completed'],
        ['item-downloading', 'downloading'],
        ['item-paused', 'paused'],
        ['item-queued', 'queued'],
        ['item-failed', 'failed'],
        ['item-cancelled', 'cancelled'],
      ]);
      getQueueStatusMap.mockResolvedValue(queueStatuses);
      await refreshPrepareOfflineInventory(5, USER_A);

      expect(getPrepareOfflineResourceStatus(5, USER_A, 'item-completed')).toBe(
        'completed',
      );
      expect(
        getPrepareOfflineResourceStatus(5, USER_A, 'item-downloading'),
      ).toBe('downloading');
      expect(getPrepareOfflineResourceStatus(5, USER_A, 'item-paused')).toBe(
        'paused',
      );
      expect(getPrepareOfflineResourceStatus(5, USER_A, 'item-queued')).toBe(
        'selected',
      );
      expect(getPrepareOfflineResourceStatus(5, USER_A, 'item-failed')).toBe(
        'available',
      );
      expect(getPrepareOfflineResourceStatus(5, USER_A, 'item-cancelled')).toBe(
        'available',
      );
    });

    it('returns available for resources with no queue row', async () => {
      getQueueStatusMap.mockResolvedValue(new Map());
      await refreshPrepareOfflineInventory(5, USER_A);

      expect(
        getPrepareOfflineResourceStatus(5, USER_A, 'missing-resource'),
      ).toBe('available');
    });

    it('does not leak statuses across projects', async () => {
      getQueueStatusMap.mockResolvedValue(new Map([['item-1', 'completed']]));
      await refreshPrepareOfflineInventory(5, USER_A);

      expect(getPrepareOfflineResourceStatus(6, USER_A, 'item-1')).toBe(
        'available',
      );
    });

    it('does not leak statuses across users on the same project', async () => {
      getQueueStatusMap.mockResolvedValue(new Map([['item-1', 'completed']]));
      await refreshPrepareOfflineInventory(5, USER_A);

      // USER_B has never had its inventory refreshed for project 5, so it
      // must not see USER_A's cached status.
      expect(getPrepareOfflineResourceStatus(5, USER_B, 'item-1')).toBe(
        'available',
      );
    });

    it('passes userId through to the repository so results are pre-scoped at the query level', async () => {
      getQueueStatusMap.mockResolvedValue(new Map());
      await refreshPrepareOfflineInventory(5, USER_A);

      expect(getQueueStatusMap).toHaveBeenCalledWith(5, USER_A);
    });
  });

  describe('subscribePrepareOfflineInventory', () => {
    it('notifies listeners only when the inventory actually changes', async () => {
      const listener = jest.fn();
      const unsubscribe = subscribePrepareOfflineInventory(listener);

      getQueueStatusMap.mockResolvedValue(new Map());
      await refreshPrepareOfflineInventory(5, USER_A);
      expect(listener).toHaveBeenCalledTimes(1);

      // Same (empty) map again: no change, no notification.
      await refreshPrepareOfflineInventory(5, USER_A);
      expect(listener).toHaveBeenCalledTimes(1);

      // Changed map: notifies again.
      getQueueStatusMap.mockResolvedValue(new Map([['item-1', 'completed']]));
      await refreshPrepareOfflineInventory(5, USER_A);
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      getQueueStatusMap.mockResolvedValue(new Map([['item-1', 'failed']]));
      await refreshPrepareOfflineInventory(5, USER_A);
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearPrepareOfflineSessionInventory', () => {
    it('clears one project+user without touching others', async () => {
      getQueueStatusMap.mockResolvedValue(new Map([['item-1', 'completed']]));
      await refreshPrepareOfflineInventory(3, USER_A);
      await refreshPrepareOfflineInventory(4, USER_A);

      clearPrepareOfflineSessionInventory(3, USER_A);

      expect(getPrepareOfflineResourceStatus(3, USER_A, 'item-1')).toBe(
        'available',
      );
      expect(getPrepareOfflineResourceStatus(4, USER_A, 'item-1')).toBe(
        'completed',
      );
    });

    it('clears one user without touching another user on the same project', async () => {
      getQueueStatusMap.mockResolvedValue(new Map([['item-1', 'completed']]));
      await refreshPrepareOfflineInventory(3, USER_A);
      await refreshPrepareOfflineInventory(3, USER_B);

      clearPrepareOfflineSessionInventory(3, USER_A);

      expect(getPrepareOfflineResourceStatus(3, USER_A, 'item-1')).toBe(
        'available',
      );
      expect(getPrepareOfflineResourceStatus(3, USER_B, 'item-1')).toBe(
        'completed',
      );
    });

    it('clears every project and user when called without arguments', async () => {
      getQueueStatusMap.mockResolvedValue(new Map([['item-1', 'completed']]));
      await refreshPrepareOfflineInventory(3, USER_A);
      await refreshPrepareOfflineInventory(4, USER_B);

      clearPrepareOfflineSessionInventory();

      expect(getPrepareOfflineResourceStatus(3, USER_A, 'item-1')).toBe(
        'available',
      );
      expect(getPrepareOfflineResourceStatus(4, USER_B, 'item-1')).toBe(
        'available',
      );
    });
  });

  describe('getDefaultPrepareOfflinePackageDeselects', () => {
    it('returns no deselects until on-device inventory pre-checking is implemented (#201)', () => {
      expect(getDefaultPrepareOfflinePackageDeselects(null).size).toBe(0);
      expect(getDefaultPrepareOfflinePackageDeselects(5).size).toBe(0);
    });
  });
});
