import { FluentAPI } from './api';
import {
  clearPrepareOfflineSessionInventory,
  fetchPrepareOfflineManifest,
  fetchPrepareOfflineManifestsBounded,
  fetchSourceBibleAudioManifest,
  getDefaultPrepareOfflinePackageDeselects,
  getPrepareOfflineResourceStatus,
  hydratePrepareOfflineTextContent,
  persistSourceAudioMetaForManifestContexts,
  PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
  refreshPrepareOfflineInventory,
  subscribePrepareOfflineInventory,
} from './prepareOfflineResources';
import { ApiError } from '../types/api/errors';
import { waitFor } from '@testing-library/react-native';
import { getDownloadQueueStatusMap } from '../db/downloadQueueRepository';
import { persistSourceAudioChapterMeta } from './offlineSourceAudio';
import type { DownloadQueueStatus } from '../types/download/types';
import type { PrepareOfflineResourceItem } from '../types/prepareOffline/types';

jest.mock('./api', () => ({
  FluentAPI: {
    getPrepareOfflineManifest: jest.fn(),
    getSourceAudioManifest: jest.fn(),
    getChapterSourceAudio: jest.fn(),
  },
}));

jest.mock('./offlineSourceAudio', () => ({
  persistSourceAudioChapterMeta: jest.fn(async () => undefined),
  SOURCE_BIBLE_RESOURCE_NAME: 'Source Bible Audio',
}));

jest.mock('../db/downloadQueueRepository', () => ({
  getDownloadQueueStatusMap: jest.fn(),
}));

const getQueueStatusMap = getDownloadQueueStatusMap as jest.MockedFunction<
  typeof getDownloadQueueStatusMap
>;
const persistMeta = persistSourceAudioChapterMeta as jest.MockedFunction<
  typeof persistSourceAudioChapterMeta
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
        scope: {
          bookCode: 'MRK',
          startChapter: 2,
          endChapter: 2,
          verseStart: 4,
          verseEnd: 7,
        },
      };
      mockTranslationManifest([translationItem]);
      mockSourceAudioManifest([
        {
          id: 'sa1',
          tier: 1,
          kind: 'audio',
          resourceName: 'Source Bible Audio',
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
          scope: { bookCode: 'MRK', startChapter: 2, endChapter: 2 },
        },
      ]);

      mockEmptyChapterAudio();

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
      expect(result[0].scope).toEqual({
        bookCode: 'MRK',
        startChapter: 2,
        endChapter: 2,
      });
      expect(result[1].scope).toEqual(translationItem.scope);
      // Successful-manifest path must not fan out chapter-audio meta fetches
      // during catalog load — that happens at download time (#579 review).
      expect(FluentAPI.getChapterSourceAudio).not.toHaveBeenCalled();
      expect(persistMeta).not.toHaveBeenCalled();
    });

    it('persists source-audio meta for each chapter in download contexts', async () => {
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
                sizeBytes: 100,
                scope: 'chapter',
              },
            ],
          }),
      );

      await persistSourceAudioMetaForManifestContexts(99, [
        {
          languageCode: 'eng',
          bookCode: 'MRK',
          startChapter: 1,
          endChapter: 3,
          bibleId: 10,
        },
      ]);

      expect(FluentAPI.getChapterSourceAudio).toHaveBeenCalledTimes(3);
      expect(persistMeta).toHaveBeenCalledTimes(3);
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
      expect(persistMeta).toHaveBeenCalledTimes(3);
      expect(result.filter(item => item.kind === 'audio')).toHaveLength(3);
      expect(result.find(item => item.kind === 'audio')).toMatchObject({
        id: 'source-bible-audio-MRK-1',
        tier: 1,
        kind: 'audio',
        resourceName: 'Source Bible Audio',
        bytesTotal: 1234,
        sourceUrl: 'https://example.com/ch1.mp3',
        fileExt: 'mp3',
        scope: { bookCode: 'MRK', startChapter: 1, endChapter: 1 },
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

    it('rejects a truncated translation-resources manifest instead of returning a partial catalog', async () => {
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
          },
        ],
        totalBytes: 512,
        truncated: true,
      });
      mockSourceAudioManifest([]);

      await expect(
        fetchPrepareOfflineManifest(99, FULL_PARAMS),
      ).rejects.toThrow('manifest truncated for project 99');

      // The source-audio call still fires (Promise.all runs both), but the
      // truncated check must reject before any fallback or merge happens.
      expect(FluentAPI.getChapterSourceAudio).not.toHaveBeenCalled();
    });

    it('does not run per-chapter audio fallback after the caller aborts', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        fetchPrepareOfflineManifest(99, FULL_PARAMS, controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(FluentAPI.getPrepareOfflineManifest).not.toHaveBeenCalled();
      expect(FluentAPI.getChapterSourceAudio).not.toHaveBeenCalled();
    });

    it('normalizes mid-flight translation abort to AbortError (not status-0 ApiError)', async () => {
      const controller = new AbortController();
      mockSourceAudioManifest([]);
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        (
          _projectId: number,
          _params: unknown,
          request?: { signal?: AbortSignal },
        ) =>
          new Promise((_resolve, reject) => {
            const onAbort = () => {
              // Mimic httpClient wrapping AbortError as network ApiError.
              reject(new ApiError(0, 'Request timed out'));
            };
            if (request?.signal?.aborted) {
              onAbort();
              return;
            }
            request?.signal?.addEventListener('abort', onAbort, { once: true });
            Promise.resolve().then(() => controller.abort());
          }),
      );

      await expect(
        fetchPrepareOfflineManifest(99, FULL_PARAMS, controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(FluentAPI.getChapterSourceAudio).not.toHaveBeenCalled();
    });
  });

  describe('fetchPrepareOfflineManifestsBounded', () => {
    const contexts = [1, 2, 3, 4].map(chapter => ({
      languageCode: 'eng',
      bookCode: 'MAT',
      bookId: 40,
      startChapter: chapter,
      endChapter: chapter,
      bibleId: 10,
    }));

    const sourceAudioItem = {
      id: 'sa',
      tier: 1 as const,
      kind: 'audio' as const,
      resourceName: 'Source Bible Audio',
      label: 'Audio',
      required: true,
      removable: false,
      bytesTotal: 1,
      sourceUrl: 'https://example.com/a.mp3',
      fileExt: 'mp3',
      languageCode: 'eng',
      bookCode: 'MAT',
      startChapter: 1,
      endChapter: 1,
      scope: { bookCode: 'MAT', startChapter: 1, endChapter: 1 },
    };

    it('keeps at most PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY context jobs in flight', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const resolvers: Array<() => void> = [];

      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        (_projectId: number, params: { startChapter: number }) =>
          new Promise(resolve => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            const chapter = params.startChapter;
            resolvers.push(() => {
              inFlight -= 1;
              resolve({
                projectId: 99,
                sourceLanguageCode: 'eng',
                items: [
                  {
                    id: `t-${chapter}`,
                    tier: 2,
                    kind: 'text',
                    resourceName: 'Notes',
                    label: 'Notes',
                    required: false,
                    removable: true,
                    bytesTotal: 1,
                    fileExt: 'json',
                    languageCode: 'eng',
                  },
                ],
                totalBytes: 1,
                truncated: false,
              });
            });
          }),
      );
      mockSourceAudioManifest([sourceAudioItem]);

      const pending = fetchPrepareOfflineManifestsBounded(99, contexts);

      await waitFor(() =>
        expect(resolvers.length).toBe(
          PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
        ),
      );
      expect(maxInFlight).toBe(PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY);
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(
        PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
      );

      resolvers.splice(0, resolvers.length).forEach(fn => fn());
      await waitFor(() =>
        expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(4),
      );
      expect(maxInFlight).toBe(PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY);
      expect(resolvers.length).toBe(
        PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
      );
      resolvers.splice(0, resolvers.length).forEach(fn => fn());

      const items = await pending;
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(4);
      expect(
        items.map(item => item.id).filter(id => id.startsWith('t-')),
      ).toEqual(['t-1', 't-2', 't-3', 't-4']);
    });

    it('does not launch queued context jobs after selection abort', async () => {
      const controller = new AbortController();
      let started = 0;
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        (
          _projectId: number,
          _params: unknown,
          request?: { signal?: AbortSignal },
        ) =>
          new Promise((_resolve, reject) => {
            started += 1;
            const onAbort = () => {
              const err = new Error('Aborted');
              err.name = 'AbortError';
              reject(err);
            };
            if (request?.signal?.aborted) {
              onAbort();
              return;
            }
            request?.signal?.addEventListener('abort', onAbort, { once: true });
            if (started === PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY) {
              Promise.resolve().then(() => controller.abort());
            }
          }),
      );
      mockSourceAudioManifest([sourceAudioItem]);

      await expect(
        fetchPrepareOfflineManifestsBounded(99, contexts, controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(started).toBe(PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY);
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(
        PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
      );
    });

    it('aggregates every context and still fails closed on 401/truncated/502', async () => {
      mockSourceAudioManifest([sourceAudioItem]);
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        (_projectId: number, params: { startChapter: number }) =>
          Promise.resolve({
            projectId: 99,
            sourceLanguageCode: 'eng',
            items: [
              {
                id: `t-${params.startChapter}`,
                tier: 2,
                kind: 'text',
                resourceName: 'Notes',
                label: 'Notes',
                required: false,
                removable: true,
                bytesTotal: 1,
                fileExt: 'json',
                languageCode: 'eng',
              },
            ],
            totalBytes: 1,
            truncated: false,
          }),
      );

      const ok = await fetchPrepareOfflineManifestsBounded(99, contexts);
      expect(ok.map(item => item.id).filter(id => id.startsWith('t-'))).toEqual(
        ['t-1', 't-2', 't-3', 't-4'],
      );

      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockRejectedValueOnce(
        new ApiError(401, 'auth', 'AUTH'),
      );
      await expect(
        fetchPrepareOfflineManifestsBounded(99, contexts.slice(0, 1)),
      ).rejects.toBeInstanceOf(ApiError);

      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockResolvedValueOnce({
        projectId: 99,
        sourceLanguageCode: 'eng',
        items: [],
        totalBytes: 0,
        truncated: true,
      });
      await expect(
        fetchPrepareOfflineManifestsBounded(99, contexts.slice(0, 1)),
      ).rejects.toThrow('manifest truncated');

      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockRejectedValueOnce(
        new ApiError(502, 'bad gateway'),
      );
      await expect(
        fetchPrepareOfflineManifestsBounded(99, contexts.slice(0, 1)),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('restores parent legacy range hints for shared translation IDs without explicit.scope only', async () => {
      const parent = {
        languageCode: 'eng',
        bookCode: 'MAT',
        bookId: 40,
        startChapter: 1,
        endChapter: 3,
        bibleId: 10,
      };
      mockSourceAudioManifest([]);
      (FluentAPI.getChapterSourceAudio as jest.Mock).mockResolvedValue({
        provider: 'dbl',
        bible: { name: 'B', abbreviation: 'ENG' },
        bookCode: 'MAT',
        chapter: 1,
        items: [],
      });
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        (_projectId: number, params: { startChapter: number }) =>
          Promise.resolve({
            projectId: 99,
            sourceLanguageCode: 'eng',
            items: [
              {
                id: 'tw-shared',
                tier: 2,
                kind: 'text',
                resourceName: 'Translation Words',
                label: 'TW',
                required: false,
                removable: true,
                bytesTotal: 10,
                fileExt: 'json',
                languageCode: 'eng',
                // Sub-job request-range echoes — not true coverage.
                bookCode: 'MAT',
                startChapter: params.startChapter,
                endChapter: params.startChapter,
              },
              {
                id: 'img-scoped',
                tier: 3,
                kind: 'image',
                resourceName: 'Image',
                label: 'Img',
                required: false,
                removable: true,
                bytesTotal: 10,
                fileExt: 'jpg',
                languageCode: 'eng',
                bookCode: 'MAT',
                startChapter: params.startChapter,
                endChapter: params.startChapter,
                scope: {
                  bookCode: 'MAT',
                  startChapter: params.startChapter,
                  endChapter: params.startChapter,
                },
              },
            ],
            totalBytes: 20,
            truncated: false,
          }),
      );

      const items = await fetchPrepareOfflineManifestsBounded(99, [parent]);
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(3);
      expect(
        jest
          .mocked(FluentAPI.getPrepareOfflineManifest)
          .mock.calls.map(call => call[1].startChapter),
      ).toEqual([1, 2, 3]);

      const shared = items.filter(item => item.id === 'tw-shared');
      expect(shared).toHaveLength(3);
      for (const item of shared) {
        expect(item.scope).toBeUndefined();
        expect(item.bookCode).toBe('MAT');
        expect(item.startChapter).toBe(1);
        expect(item.endChapter).toBe(3);
      }

      const scoped = items.filter(item => item.id === 'img-scoped');
      expect(scoped).toHaveLength(3);
      expect(scoped.map(item => item.startChapter)).toEqual([1, 2, 3]);
      expect(scoped.map(item => item.scope?.startChapter)).toEqual([1, 2, 3]);
    });

    it('leaves source-audio legacy chapter fields unchanged across sub-jobs', async () => {
      const parent = {
        languageCode: 'eng',
        bookCode: 'MAT',
        bookId: 40,
        startChapter: 1,
        endChapter: 2,
        bibleId: 10,
      };
      mockTranslationManifest([]);
      (FluentAPI.getSourceAudioManifest as jest.Mock).mockImplementation(
        (_projectId: number, params: { startChapter: number }) =>
          Promise.resolve({
            projectId: 99,
            sourceLanguageCode: 'eng',
            provider: 'aquifer',
            items: [
              {
                id: `sa-${params.startChapter}`,
                tier: 1,
                kind: 'audio',
                resourceName: 'Source Bible Audio',
                label: 'Audio',
                required: true,
                removable: false,
                bytesTotal: 1,
                sourceUrl: `https://example.com/${params.startChapter}.mp3`,
                fileExt: 'mp3',
                languageCode: 'eng',
                bookCode: 'MAT',
                startChapter: params.startChapter,
                endChapter: params.startChapter,
                scope: {
                  bookCode: 'MAT',
                  startChapter: params.startChapter,
                  endChapter: params.startChapter,
                },
              },
            ],
            totalBytes: 1,
          }),
      );

      const items = await fetchPrepareOfflineManifestsBounded(99, [parent]);
      const audio = items.filter(item => item.kind === 'audio');
      expect(audio.map(item => item.id)).toEqual(['sa-1', 'sa-2']);
      expect(audio.map(item => item.startChapter)).toEqual([1, 2]);
      expect(audio.map(item => item.endChapter)).toEqual([1, 2]);
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

    it('copies serializedContent onto matching members via bounded chapter jobs', async () => {
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        (_projectId: number, params: { startChapter: number }) =>
          Promise.resolve({
            projectId: 99,
            sourceLanguageCode: 'eng',
            items:
              params.startChapter === 1
                ? [
                    { id: 'tw1', serializedContent: '{"a":1}' },
                    { id: 'tw2', serializedContent: '{"b":2}' },
                  ]
                : [],
            totalBytes: 0,
            truncated: false,
          }),
      );

      const result = await hydratePrepareOfflineTextContent(
        99,
        [textRow('available', ['tw1', 'tw2'])],
        [FULL_PARAMS],
      );

      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(3);
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledWith(
        99,
        {
          languageCode: 'eng',
          bookCode: 'MRK',
          startChapter: 1,
          endChapter: 1,
          includeContent: true,
        },
        { signal: expect.any(AbortSignal) },
      );
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledWith(
        99,
        {
          languageCode: 'eng',
          bookCode: 'MRK',
          startChapter: 3,
          endChapter: 3,
          includeContent: true,
        },
        { signal: expect.any(AbortSignal) },
      );
      expect(
        result[0].manifestMembers.map(member => member.serializedContent),
      ).toEqual(['{"a":1}', '{"b":2}']);
    });

    it('passes job AbortSignal into includeContent hydration requests', async () => {
      const signals: Array<AbortSignal | undefined> = [];
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        (
          _projectId: number,
          _params: unknown,
          request?: { signal?: AbortSignal },
        ) => {
          signals.push(request?.signal);
          return Promise.resolve({
            projectId: 99,
            sourceLanguageCode: 'eng',
            items: [{ id: 'tw1', serializedContent: '{}' }],
            totalBytes: 0,
            truncated: false,
          });
        },
      );

      await hydratePrepareOfflineTextContent(
        99,
        [textRow('available', ['tw1'])],
        [FULL_PARAMS],
      );

      expect(signals).toHaveLength(3);
      expect(signals.every(signal => signal instanceof AbortSignal)).toBe(true);
    });

    it('bounds includeContent hydration concurrency', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const resolvers: Array<() => void> = [];
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            resolvers.push(() => {
              inFlight -= 1;
              resolve({
                projectId: 99,
                sourceLanguageCode: 'eng',
                items: [{ id: 'tw1', serializedContent: '{}' }],
                totalBytes: 0,
                truncated: false,
              });
            });
          }),
      );

      const pending = hydratePrepareOfflineTextContent(
        99,
        [textRow('available', ['tw1'])],
        [FULL_PARAMS],
      );
      await waitFor(() =>
        expect(resolvers.length).toBe(
          PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
        ),
      );
      expect(maxInFlight).toBe(PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY);
      resolvers.splice(0, resolvers.length).forEach(fn => fn());
      await waitFor(() =>
        expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(3),
      );
      resolvers.splice(0, resolvers.length).forEach(fn => fn());
      await pending;
      expect(maxInFlight).toBe(PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY);
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

    it('prepares URL-only text without depending on the content manifest', async () => {
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockRejectedValue(
        new Error('unrelated manifest resource unavailable'),
      );
      const row = textRow('available', ['commentary']);
      row.manifestMembers[0].sourceUrl = 'https://example.com/commentary.pdf';
      row.manifestMembers[0].fileExt = 'pdf';

      const result = await hydratePrepareOfflineTextContent(
        99,
        [row],
        [FULL_PARAMS],
      );

      expect(FluentAPI.getPrepareOfflineManifest).not.toHaveBeenCalled();
      expect(result).toEqual([row]);
      expect(result[0].manifestMembers[0].serializedContent).toBeUndefined();
    });

    it('keeps already supplied inline content without fetching it again', async () => {
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockRejectedValue(
        new Error('manifest unavailable'),
      );
      const row = textRow('available', ['tw1']);
      row.manifestMembers[0].serializedContent = '{"a":1}';

      await expect(
        hydratePrepareOfflineTextContent(99, [row], [FULL_PARAMS]),
      ).resolves.toEqual([row]);
      expect(FluentAPI.getPrepareOfflineManifest).not.toHaveBeenCalled();
    });

    it('still fetches missing required content in a mixed URL and inline row', async () => {
      const row = textRow('available', ['url-only', 'required-note']);
      row.required = true;
      row.removable = false;
      row.manifestMembers[0].sourceUrl = 'https://example.com/commentary.json';
      row.manifestMembers[1].required = true;
      mockTranslationManifest([
        { id: 'required-note', serializedContent: '{"note":1}' },
      ]);

      const result = await hydratePrepareOfflineTextContent(
        99,
        [row],
        [FULL_PARAMS],
      );

      // URL-only members must not skip hydration for siblings that still need
      // inline content. FULL_PARAMS expands to one includeContent job per
      // chapter (1..3), matching bounded catalog/hydration fetches.
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledTimes(3);
      expect(FluentAPI.getPrepareOfflineManifest).toHaveBeenCalledWith(
        99,
        {
          languageCode: 'eng',
          bookCode: 'MRK',
          startChapter: 1,
          endChapter: 1,
          includeContent: true,
        },
        { signal: expect.any(AbortSignal) },
      );
      expect(result[0].manifestMembers[0]).toEqual(row.manifestMembers[0]);
      expect(result[0].manifestMembers[0].serializedContent).toBeUndefined();
      expect(result[0].manifestMembers[1].serializedContent).toBe('{"note":1}');
    });

    it('fails closed and can retry when required content is unavailable', async () => {
      const row = textRow('available', ['required-note']);
      row.required = true;
      row.removable = false;
      row.manifestMembers[0].required = true;
      mockTranslationManifest([]);

      await expect(
        hydratePrepareOfflineTextContent(99, [row], [FULL_PARAMS]),
      ).rejects.toThrow('No content returned for text item required-note');
      expect(row.manifestMembers[0].serializedContent).toBeUndefined();

      mockTranslationManifest([
        { id: 'required-note', serializedContent: '{"note":1}' },
      ]);
      const result = await hydratePrepareOfflineTextContent(
        99,
        [row],
        [FULL_PARAMS],
      );
      expect(result[0].manifestMembers[0].serializedContent).toBe('{"note":1}');
    });

    it('propagates a necessary manifest failure without returning ready siblings', async () => {
      const row = textRow('available', ['url-only', 'required-note']);
      row.manifestMembers[0].sourceUrl = 'https://example.com/commentary.json';
      row.manifestMembers[1].required = true;
      const failure = new Error('required resource lookup failed');
      (FluentAPI.getPrepareOfflineManifest as jest.Mock).mockRejectedValue(
        failure,
      );

      await expect(
        hydratePrepareOfflineTextContent(99, [row], [FULL_PARAMS]),
      ).rejects.toBe(failure);
      expect(row.manifestMembers[1].serializedContent).toBeUndefined();
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

    it('does not persist meta when aborted after a deferred fallback response', async () => {
      const controller = new AbortController();
      let resolveAudio: ((value: unknown) => void) | undefined;
      (FluentAPI.getChapterSourceAudio as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve => {
            resolveAudio = resolve;
          }),
      );

      const pending = fetchSourceBibleAudioManifest(
        99,
        [{ bookCode: 'MRK', chapterNumber: 1 }],
        'eng',
        10,
        controller.signal,
      );

      await waitFor(() =>
        expect(FluentAPI.getChapterSourceAudio).toHaveBeenCalled(),
      );
      controller.abort();
      resolveAudio?.({
        provider: 'dbl',
        bible: { name: 'B', abbreviation: 'ENG' },
        bookCode: 'MRK',
        chapter: 1,
        items: [
          {
            format: 'mp3',
            url: 'https://example.com/late.mp3',
            sizeBytes: 9,
            scope: 'chapter',
          },
        ],
      });

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(persistMeta).not.toHaveBeenCalled();
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
