import { FluentAPI } from './api';
import { getDownloadQueueStatusMap } from '../db/downloadQueueRepository';
import type { ApiPrepareOfflineManifestItem } from '../types/api/translationResources';
import type { ApiSourceAudioResponse } from '../types/api/sourceAudio';
import type { ApiSourceAudioManifestItem } from '../types/api/sourceAudio';
import { unwrapApiListResponse } from '../types/api/responses';
import type { ApiBook } from '../types/api/types';
import {
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';
import type { DownloadQueueStatus } from '../types/download/types';

export type PrepareOfflineInventoryListener = () => void;

const inventoryListeners = new Set<PrepareOfflineInventoryListener>();
const statusMapCache = new Map<number, Map<string, DownloadQueueStatus>>();

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

/**
 * Refresh the cached status map for a project from `download_queue` and
 * notify subscribers. Call after any queue-mutating operation for the
 * project (enqueue, worker progress/completion/failure) so status readers
 * see current data.
 */
export async function refreshPrepareOfflineInventory(
  projectId: number,
): Promise<void> {
  const map = await getDownloadQueueStatusMap(projectId);
  statusMapCache.set(projectId, map);
  notifyInventoryListeners();
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
    resourceName: 'Source Bible',
    label: 'Audio',
    required: true,
    removable: false,
    bytesTotal: item.sizeBytes ?? 0,
    sourceUrl: item.url,
    fileExt: item.format,
    languageCode: response.bible.abbreviation,
    bookCode: response.bookCode,
    startChapter: response.chapter,
    endChapter: response.chapter,
  };
}

/**
 * Tier 1 Source Bible audio — per-chapter fallback via the same fluent-api
 * endpoint the drafting dock uses (#282), which correctly resolves dbl vs
 * aquifer. Only called when source-audio/manifest returns nothing, since
 * that endpoint currently only queries Aquifer (confirmed gap — see wiring
 * notes). May over-fetch unselected chapters within the range; acceptable,
 * matches the existing over-fetch tolerance for the translation-resources
 * manifest.
 */
export async function fetchSourceBibleAudioManifest(
  projectId: number,
  chapters: Array<{ bookCode: string; chapterNumber: number }>,
  languageCode: string,
  bibleId: number,
): Promise<PrepareOfflineResourceManifestItem[]> {
  const settled = await Promise.all(
    chapters.map(async ch => {
      try {
        const response = await FluentAPI.getChapterSourceAudio({
          projectId,
          bookCode: ch.bookCode,
          chapter: ch.chapterNumber,
          languageCode,
          bibleId,
        });
        return toSourceBibleAudioManifestItem(response);
      } catch (error) {
        // Fallback path: one missing chapter must not reject the whole
        // manifest — skip it and keep the rest of the package (#504).
        console.warn(
          `[prepareOfflineResources] source-audio fallback failed for ${ch.bookCode} ${ch.chapterNumber}`,
          error,
        );
        return null;
      }
    }),
  );

  return settled.filter(
    (i): i is PrepareOfflineResourceManifestItem => i !== null,
  );
}

/** Rough JSON byte size for a chapter's text content (no server-provided size field). */
function estimateTextBytes(verses: unknown): number {
  const json = JSON.stringify(verses);
  return unescape(encodeURIComponent(json)).length;
}

function toSourceBibleTextManifestItem(
  chapter: ApiBook,
  bookCode: string,
  languageCode: string,
): PrepareOfflineResourceManifestItem {
  return {
    id: `source-bible-text-${bookCode}-${chapter.chapterNumber}`,
    tier: 1,
    kind: 'text',
    resourceName: 'Source Bible',
    label: 'Text',
    required: true,
    removable: false,
    bytesTotal: estimateTextBytes(chapter.verses),
    fileExt: 'json',
    languageCode,
    bookCode,
    startChapter: chapter.chapterNumber,
    endChapter: chapter.chapterNumber,
  };
}

/**
 * Tier 1 Source Bible text — single bulk POST for all selected chapters of
 * one book, keyed by bookId (distinct from bookCode — unlike every other
 * manifest call in this file). One failure must not sink the rest of the
 * Prepare Offline package (#504).
 */
export async function fetchSourceBibleTextManifest(
  bibleId: number,
  bookId: number,
  bookCode: string,
  chapterNumbers: number[],
  languageCode: string,
): Promise<PrepareOfflineResourceManifestItem[]> {
  try {
    const response = await FluentAPI.getBibleTexts(
      bibleId,
      chapterNumbers.map(chapterNumber => ({ bookId, chapterNumber })),
    );

    const chapters = unwrapApiListResponse(response);

    return chapters.map(chapter =>
      toSourceBibleTextManifestItem(chapter, bookCode, languageCode),
    );
  } catch (error) {
    console.warn(
      `[prepareOfflineResources] source-text fetch failed for bible ${bibleId}, book ${bookCode}`,
      error,
    );
    return [];
  }
}

function toMobileManifestItem(
  apiItem: ApiPrepareOfflineManifestItem,
): PrepareOfflineResourceManifestItem {
  const tierOverride = apiItem.collectionCode
    ? TIER_OVERRIDE_BY_COLLECTION_CODE[apiItem.collectionCode]
    : undefined;

  return {
    ...apiItem,
    tier: tierOverride ?? apiItem.tier,
  };
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
    bookCode: apiItem.bookCode,
    startChapter: apiItem.startChapter,
    endChapter: apiItem.endChapter,
  };
}

export interface FetchPrepareOfflineManifestParams {
  languageCode: string;
  bookCode: string;
  bookId: number;
  startChapter: number;
  endChapter: number;
  bibleId: number;
}

export async function fetchPrepareOfflineManifest(
  projectId: number,
  params: FetchPrepareOfflineManifestParams,
): Promise<PrepareOfflineResourceManifestItem[]> {
  const { bibleId, bookId, ...translationResourcesParams } = params;

  const [translationResourcesResponse, sourceAudioResponse, sourceTextItems] =
    await Promise.all([
      FluentAPI.getPrepareOfflineManifest(
        projectId,
        translationResourcesParams,
      ),
      FluentAPI.getSourceAudioManifest(projectId, params),
      fetchSourceBibleTextManifest(
        bibleId,
        bookId,
        params.bookCode,
        range(params.startChapter, params.endChapter),
        params.languageCode,
      ),
    ]);

  if (translationResourcesResponse.truncated) {
    console.warn(
      `[prepareOfflineResources] manifest truncated for project ${projectId}`,
    );
  }

  let sourceAudioItems = sourceAudioResponse.items.map(
    toMobileManifestItemFromSourceAudio,
  );

  if (sourceAudioItems.length === 0) {
    sourceAudioItems = await fetchSourceBibleAudioManifest(
      projectId,
      range(params.startChapter, params.endChapter).map(chapterNumber => ({
        bookCode: params.bookCode,
        chapterNumber,
      })),
      params.languageCode,
      bibleId,
    );
  }

  return [
    ...translationResourcesResponse.items.map(toMobileManifestItem),
    ...sourceTextItems,
    ...sourceAudioItems,
  ];
}

/** On-device / in-flight status for one resource row. Reads the last-refreshed cache; call refreshPrepareOfflineInventory(projectId) after queue mutations to keep it current. */
export function getPrepareOfflineResourceStatus(
  projectId: number,
  resourceId: string,
): PrepareOfflineResourceStatus {
  const status = statusMapCache.get(projectId)?.get(resourceId);
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

/** Clear cached inventory for a project (e.g. account switch); caller should refresh after. */
export function clearPrepareOfflineSessionInventory(projectId?: number): void {
  if (projectId === undefined) {
    statusMapCache.clear();
  } else {
    statusMapCache.delete(projectId);
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
