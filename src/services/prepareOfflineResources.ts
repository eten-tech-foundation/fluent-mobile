import { FluentAPI } from './api';
import { getDownloadQueueStatusMap } from '../db/downloadQueueRepository';
import type { ApiPrepareOfflineManifestItem } from '../types/api/translationResources';
import type { ApiSourceAudioResponse } from '../types/api/sourceAudio';
import type { ApiSourceAudioManifestItem } from '../types/api/sourceAudio';
import {
  PrepareOfflineResourceItem,
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';
import type { DownloadQueueStatus } from '../types/download/types';
import {
  persistSourceAudioChapterMeta,
  SOURCE_BIBLE_RESOURCE_NAME,
} from './offlineSourceAudio';
import { logger } from '../utils/logger';

const log = logger.create('prepareOfflineResources');

export interface FetchPrepareOfflineManifestParams {
  languageCode: string;
  bookCode: string;
  bookId: number;
  startChapter: number;
  endChapter: number;
  bibleId: number;
}

/**
 * Max concurrent single-chapter network jobs for catalog/hydration fetches.
 * Each catalog job may still fan to translation + source-audio HTTP calls.
 */
export const PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY = 2;

/** One network fetch tied to the canonical parent context it was split from. */
type PrepareOfflineChapterNetworkJob = {
  parent: FetchPrepareOfflineManifestParams;
  request: FetchPrepareOfflineManifestParams;
};

function expandContextsToChapterJobs(
  contexts: FetchPrepareOfflineManifestParams[],
): PrepareOfflineChapterNetworkJob[] {
  const jobs: PrepareOfflineChapterNetworkJob[] = [];
  for (const parent of contexts) {
    for (
      let chapter = parent.startChapter;
      chapter <= parent.endChapter;
      chapter++
    ) {
      jobs.push({
        parent,
        request: {
          ...parent,
          startChapter: chapter,
          endChapter: chapter,
        },
      });
    }
  }
  return jobs;
}

async function runChapterJobsBounded<T>(
  jobs: PrepareOfflineChapterNetworkJob[],
  signal: AbortSignal | undefined,
  concurrency: number,
  run: (
    job: PrepareOfflineChapterNetworkJob,
    jobSignal: AbortSignal,
  ) => Promise<T>,
): Promise<T[]> {
  throwIfAborted(signal);
  if (jobs.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, jobs.length));
  const jobController = new AbortController();
  const onCallerAbort = () => jobController.abort();
  if (signal) {
    if (signal.aborted) {
      jobController.abort();
    } else {
      signal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const results: T[] = new Array(jobs.length);
  let cursor = 0;
  let fatalError: unknown;

  async function worker(): Promise<void> {
    while (cursor < jobs.length) {
      if (signal?.aborted || jobController.signal.aborted || fatalError) {
        return;
      }
      const index = cursor++;
      try {
        results[index] = await run(jobs[index], jobController.signal);
      } catch (error) {
        if (signal?.aborted || fatalError) {
          return;
        }
        fatalError = error;
        jobController.abort();
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: limit }, () => worker()));
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onCallerAbort);
    }
  }

  throwIfAborted(signal);
  if (fatalError) {
    throw fatalError;
  }

  for (let i = 0; i < results.length; i++) {
    if (results[i] === undefined) {
      throw new Error(
        '[prepareOfflineResources] incomplete chapter-job aggregate',
      );
    }
  }

  return results;
}

function createAbortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export type PrepareOfflineInventoryListener = () => void;

const inventoryListeners = new Set<PrepareOfflineInventoryListener>();
const statusMapCache = new Map<string, Map<string, DownloadQueueStatus>>();

function cacheKey(projectId: number, userId: number): string {
  return `${projectId}-${userId}`;
}

function mapQueueStatusToResourceStatus(
  status: DownloadQueueStatus | undefined,
): PrepareOfflineResourceStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'downloading':
      return 'downloading';
    case 'paused':
      return 'paused';
    case 'queued':
      return 'selected';
    case 'failed':
    case 'cancelled':
    case undefined:
    default:
      return 'available';
  }
}

function notifyInventoryListeners(): void {
  for (const listener of inventoryListeners) {
    listener();
  }
}

function statusMapsEqual(
  previous: Map<string, DownloadQueueStatus> | undefined,
  next: Map<string, DownloadQueueStatus>,
): boolean {
  if (!previous || previous.size !== next.size) return false;
  for (const [id, status] of next) {
    if (previous.get(id) !== status) return false;
  }
  return true;
}

/**
 * Refresh the cached status map for a project+user from `download_queue` and
 * notify subscribers. Call after any queue-mutating operation for the
 * project (enqueue, worker progress/completion/failure) so status readers
 * see current data.
 */
export async function refreshPrepareOfflineInventory(
  projectId: number,
  userId: number,
): Promise<void> {
  const map = await getDownloadQueueStatusMap(projectId, userId);
  const key = cacheKey(projectId, userId);
  const previousMap = statusMapCache.get(key);
  statusMapCache.set(key, map);
  if (!statusMapsEqual(previousMap, map)) {
    notifyInventoryListeners();
  }
}
/** Fluent API manifest resources whose tier mobile overrides regardless of server value. */
const TIER_OVERRIDE_BY_COLLECTION_CODE: Record<string, 1 | 2 | 3> = {
  // Translation Notes ships under Tier 2 server-side; mobile UI treats it as Tier 1.
  UWTranslationNotes: 1,
};

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let n = start; n <= end; n++) out.push(n);
  return out;
}

/** Prefer mp3 if multiple formats are returned for a chapter. */
function pickPreferredAudioItem(response: ApiSourceAudioResponse) {
  return response.items.find(i => i.format === 'mp3') ?? response.items[0];
}

function toSourceBibleAudioManifestItem(
  response: ApiSourceAudioResponse,
): PrepareOfflineResourceManifestItem | null {
  const item = pickPreferredAudioItem(response);
  if (!item) return null;

  return {
    id: `source-bible-audio-${response.bookCode}-${response.chapter}`,
    tier: 1,
    kind: 'audio',
    resourceName: SOURCE_BIBLE_RESOURCE_NAME,
    label: 'Audio',
    required: true,
    removable: false,
    bytesTotal: item.sizeBytes ?? 0,
    sourceUrl: item.url,
    fileExt: item.format,
    languageCode: response.bible.abbreviation,
    scope: {
      bookCode: response.bookCode,
      startChapter: response.chapter,
      endChapter: response.chapter,
      verseStart: item.scope === 'verse' ? response.verse : undefined,
      verseEnd: item.scope === 'verse' ? response.verse : undefined,
    },
    bookCode: response.bookCode,
    startChapter: response.chapter,
    endChapter: response.chapter,
  };
}

/**
 * Tier 1 Source Bible audio — per-chapter fallback via the same fluent-api
 * endpoint the drafting dock uses (#282), which correctly resolves dbl vs
 * aquifer. Only called when source-audio/manifest returns nothing (or fails),
 * since that endpoint currently only queries Aquifer (confirmed gap — see
 * wiring notes). May over-fetch unselected chapters within the range;
 * acceptable, matches the existing over-fetch tolerance for the
 * translation-resources manifest.
 */
export async function fetchSourceBibleAudioManifest(
  projectId: number,
  chapters: Array<{ bookCode: string; chapterNumber: number }>,
  languageCode: string,
  bibleId: number,
  signal?: AbortSignal,
): Promise<PrepareOfflineResourceManifestItem[]> {
  const settled = await Promise.all(
    chapters.map(async ch => {
      try {
        throwIfAborted(signal);
        const response = await FluentAPI.getChapterSourceAudio(
          {
            projectId,
            bookCode: ch.bookCode,
            chapter: ch.chapterNumber,
            languageCode,
            bibleId,
          },
          signal ? { signal } : undefined,
        );
        // Cancelled selection must not persist a late fallback response.
        throwIfAborted(signal);
        // Persist verse timestamps during Prepare so offline seek works (#579).
        await persistSourceAudioChapterMeta(projectId, response);
        return toSourceBibleAudioManifestItem(response);
      } catch (error) {
        if (signal?.aborted || isAbortLikeError(error)) {
          throw createAbortError();
        }
        // Fallback path: one missing chapter must not reject the whole
        // manifest — skip it and keep the rest of the package (#504).
        log.warn('source-audio fallback failed', {
          bookCode: ch.bookCode,
          chapter: ch.chapterNumber,
          error,
        });
        return null;
      }
    }),
  );

  return settled.filter(
    (i): i is PrepareOfflineResourceManifestItem => i !== null,
  );
}

/**
 * Map a translation-resources manifest item. When a single-chapter sub-job
 * rewrites legacy book/start/end to the request chapter, restore the
 * canonical parent range hints — but only when the API omitted `scope`.
 * Never invent or overwrite explicit.scope; never use this for source-audio.
 */
function toMobileManifestItem(
  apiItem: ApiPrepareOfflineManifestItem,
  canonicalParent?: FetchPrepareOfflineManifestParams,
): PrepareOfflineResourceManifestItem {
  const tierOverride = apiItem.collectionCode
    ? TIER_OVERRIDE_BY_COLLECTION_CODE[apiItem.collectionCode]
    : undefined;

  const mapped: PrepareOfflineResourceManifestItem = {
    ...apiItem,
    tier: tierOverride ?? apiItem.tier,
  };

  if (canonicalParent && apiItem.scope === undefined) {
    return {
      ...mapped,
      bookCode: canonicalParent.bookCode,
      startChapter: canonicalParent.startChapter,
      endChapter: canonicalParent.endChapter,
    };
  }

  return mapped;
}

/** Source-audio manifest items are already Tier 1 — no tier override needed. */
function toMobileManifestItemFromSourceAudio(
  apiItem: ApiSourceAudioManifestItem,
): PrepareOfflineResourceManifestItem {
  return {
    id: apiItem.id,
    tier: apiItem.tier,
    kind: apiItem.kind,
    resourceName: apiItem.resourceName,
    label: apiItem.label,
    required: apiItem.required,
    removable: apiItem.removable,
    bytesTotal: apiItem.bytesTotal,
    sourceUrl: apiItem.sourceUrl,
    fileExt: apiItem.fileExt,
    languageCode: apiItem.languageCode,
    scope: apiItem.scope,
    bookCode: apiItem.bookCode,
    startChapter: apiItem.startChapter,
    endChapter: apiItem.endChapter,
  };
}

export async function fetchPrepareOfflineManifest(
  projectId: number,
  params: FetchPrepareOfflineManifestParams,
  signal?: AbortSignal,
  /**
   * Canonical parent context when `params` is a single-chapter network split.
   * Used only to restore translation legacy range hints (not source-audio,
   * not explicit.scope).
   */
  canonicalParent?: FetchPrepareOfflineManifestParams,
): Promise<PrepareOfflineResourceManifestItem[]> {
  throwIfAborted(signal);
  const { bibleId, bookId: _bookId, ...translationResourcesParams } = params;

  let translationResourcesResponse: Awaited<
    ReturnType<typeof FluentAPI.getPrepareOfflineManifest>
  >;
  let sourceAudioResponse:
    | Awaited<ReturnType<typeof FluentAPI.getSourceAudioManifest>>
    | undefined;
  try {
    [translationResourcesResponse, sourceAudioResponse] = await Promise.all([
      signal
        ? FluentAPI.getPrepareOfflineManifest(
            projectId,
            translationResourcesParams,
            { signal },
          )
        : FluentAPI.getPrepareOfflineManifest(
            projectId,
            translationResourcesParams,
          ),
      // A source-audio manifest failure (e.g. 5xx / 502 from the Aquifer
      // upstream) must not sink the rest of the package. Treat it as "no
      // manifest" so the per-chapter fallback below runs instead (#504).
      (signal
        ? FluentAPI.getSourceAudioManifest(projectId, params, { signal })
        : FluentAPI.getSourceAudioManifest(projectId, params)
      ).catch(error => {
        if (signal?.aborted || isAbortLikeError(error)) {
          throw createAbortError();
        }
        log.warn('source-audio manifest failed', {
          bookCode: params.bookCode,
          error,
        });
        return undefined;
      }),
    ]);
  } catch (error) {
    // httpClient wraps AbortError as ApiError status 0 — normalize via signal.
    if (signal?.aborted || isAbortLikeError(error)) {
      throw createAbortError();
    }
    throw error;
  }

  throwIfAborted(signal);

  // A truncated manifest can omit required items (e.g. Translation Notes)
  // that exceed the API's per-resource cap. Silently continuing would let
  // downloads start from an incomplete catalog and mark the package
  // "complete" while content is actually missing — reject instead (#504).
  if (translationResourcesResponse.truncated) {
    throw new Error(
      `[prepareOfflineResources] manifest truncated for project ${projectId}`,
    );
  }

  let sourceAudioItems = (sourceAudioResponse?.items ?? []).map(
    toMobileManifestItemFromSourceAudio,
  );

  if (sourceAudioItems.length === 0) {
    throwIfAborted(signal);
    // Empty-manifest fallback still needs per-chapter getChapterSourceAudio
    // to build catalog rows (URLs/sizes). Verse-timestamp persistence for the
    // successful-manifest path happens at download time instead (#579 review).
    sourceAudioItems = await fetchSourceBibleAudioManifest(
      projectId,
      range(params.startChapter, params.endChapter).map(chapterNumber => ({
        bookCode: params.bookCode,
        chapterNumber,
      })),
      params.languageCode,
      bibleId,
      signal,
    );
  }

  throwIfAborted(signal);

  return [
    ...sourceAudioItems,
    ...translationResourcesResponse.items.map(item =>
      toMobileManifestItem(item, canonicalParent),
    ),
  ];
}

/**
 * Load manifests for every canonical context with a small concurrency cap.
 * Contiguous max-20 contexts stay intact for callers; network work splits to
 * single-chapter jobs that rematerialize translation legacy range hints from
 * the parent. Stops queued jobs on `signal` abort; fail-closed on first fatal.
 */
export async function fetchPrepareOfflineManifestsBounded(
  projectId: number,
  contexts: FetchPrepareOfflineManifestParams[],
  signal?: AbortSignal,
  concurrency: number = PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
): Promise<PrepareOfflineResourceManifestItem[]> {
  const jobs = expandContextsToChapterJobs(contexts);
  const batches = await runChapterJobsBounded(
    jobs,
    signal,
    concurrency,
    (job, jobSignal) =>
      fetchPrepareOfflineManifest(
        projectId,
        job.request,
        jobSignal,
        job.parent,
      ),
  );
  return batches.flat();
}

/**
 * Best-effort verse-timestamp cache for selected Prepare Offline chapters.
 * Call at download time (not catalog load) so chapter toggles do not fan out
 * one getChapterSourceAudio per chapter. Failures are logged and ignored —
 * download enqueue must not fail because metadata persistence failed (#579).
 */
export async function persistSourceAudioMetaForManifestContexts(
  projectId: number,
  contexts: Array<{
    languageCode: string;
    bookCode: string;
    startChapter: number;
    endChapter: number;
    bibleId: number;
  }>,
): Promise<void> {
  const chapters = new Map<
    string,
    {
      bookCode: string;
      chapter: number;
      languageCode: string;
      bibleId: number;
    }
  >();
  for (const ctx of contexts) {
    const bookCode = ctx.bookCode?.trim();
    if (!bookCode) continue;
    for (const chapter of range(ctx.startChapter, ctx.endChapter)) {
      chapters.set(`${ctx.bibleId}:${bookCode}:${chapter}`, {
        bookCode,
        chapter,
        languageCode: ctx.languageCode,
        bibleId: ctx.bibleId,
      });
    }
  }

  await Promise.all(
    [...chapters.values()].map(
      async ({ bookCode, chapter, languageCode, bibleId }) => {
        try {
          const response = await FluentAPI.getChapterSourceAudio({
            projectId,
            bookCode,
            chapter,
            languageCode,
            bibleId,
          });
          await persistSourceAudioChapterMeta(projectId, response);
        } catch (error) {
          log.warn('source-audio meta persist failed', {
            bookCode,
            chapter,
            error,
          });
        }
      },
    ),
  );
}

/**
 * Re-fetches the manifest WITH content for the selected text rows and
 * copies serializedContent onto each member. Called once at download time;
 * the catalog stays metadata-only (#504).
 *
 * Text members that ship only a `sourceUrl` (e.g. commentary .json / .pdf)
 * have no inline content; they are left untouched here and downloaded from
 * their URL by the download worker.
 */
export async function hydratePrepareOfflineTextContent(
  projectId: number,
  items: PrepareOfflineResourceItem[],
  contexts: FetchPrepareOfflineManifestParams[],
): Promise<PrepareOfflineResourceItem[]> {
  // Only text rows that still need downloading need content.
  const needsContent = (item: PrepareOfflineResourceItem) =>
    item.kind === 'text' && item.status !== 'completed';

  if (!items.some(needsContent)) {
    return items;
  }

  // Bound single-chapter includeContent fetches; canonical contexts unchanged.
  const jobs = expandContextsToChapterJobs(contexts);
  const responses = await runChapterJobsBounded(
    jobs,
    undefined,
    PREPARE_OFFLINE_MANIFEST_CONTEXT_CONCURRENCY,
    async (job, jobSignal) => {
      const { bibleId: _bibleId, bookId: _bookId, ...params } = job.request;
      return FluentAPI.getPrepareOfflineManifest(
        projectId,
        {
          ...params,
          includeContent: true,
        },
        { signal: jobSignal },
      );
    },
  );

  const contentById = new Map<string, string>();
  for (const response of responses) {
    for (const member of response.items) {
      if (member.serializedContent !== undefined) {
        contentById.set(member.id, member.serializedContent);
      }
    }
  }

  return items.map(item => {
    if (!needsContent(item)) return item;

    const manifestMembers = item.manifestMembers.map(member => ({
      ...member,
      serializedContent: contentById.get(member.id) ?? member.serializedContent,
    }));

    // A member with neither inline content nor a sourceUrl can never be
    // downloaded — that's a real error. A URL-only member is fine: the
    // worker fetches it from sourceUrl.
    const missing = manifestMembers.find(
      m => m.serializedContent === undefined && !m.sourceUrl,
    );
    if (missing) {
      throw new Error(`No content returned for text item ${missing.id}`);
    }

    return { ...item, manifestMembers };
  });
}

/**
 * On-device / in-flight status for one resource row, scoped to the current
 * user. Reads the last-refreshed cache; call
 * refreshPrepareOfflineInventory(projectId, userId) after queue mutations to
 * keep it current.
 */
export function getPrepareOfflineResourceStatus(
  projectId: number,
  userId: number,
  resourceId: string,
): PrepareOfflineResourceStatus {
  const status = statusMapCache
    .get(cacheKey(projectId, userId))
    ?.get(resourceId);
  return mapQueueStatusToResourceStatus(status);
}

/** Subscribe to inventory changes — fires after refreshPrepareOfflineInventory runs. */
export function subscribePrepareOfflineInventory(
  listener: PrepareOfflineInventoryListener,
): () => void {
  inventoryListeners.add(listener);
  return () => {
    inventoryListeners.delete(listener);
  };
}

/** Clear cached inventory for a project+user (e.g. account switch); caller should refresh after. */
export function clearPrepareOfflineSessionInventory(
  projectId?: number,
  userId?: number,
): void {
  if (projectId === undefined || userId === undefined) {
    statusMapCache.clear();
  } else {
    statusMapCache.delete(cacheKey(projectId, userId));
  }
  notifyInventoryListeners();
}

/**
 * Everything the real manifest returns is checked by default (#504) —
 * Tier 1 is never deselectable (locked in the catalog builder), so no
 * default deselects are needed. Kept as a seam so #201's on-device
 * inventory can pre-check completed tiers without touching UI code.
 */
export function getDefaultPrepareOfflinePackageDeselects(
  _projectId: number | null = null,
): Set<string> {
  return new Set();
}
