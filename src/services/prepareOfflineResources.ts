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
  const { bibleId, bookId: _bookId, ...translationResourcesParams } = params;

  const [translationResourcesResponse, sourceAudioResponse] = await Promise.all(
    [
      FluentAPI.getPrepareOfflineManifest(
        projectId,
        translationResourcesParams,
      ),
      // A source-audio manifest failure (e.g. 5xx / 502 from the Aquifer
      // upstream) must not sink the rest of the package. Treat it as "no
      // manifest" so the per-chapter fallback below runs instead (#504).
      FluentAPI.getSourceAudioManifest(projectId, params).catch(error => {
        console.warn(
          `[prepareOfflineResources] source-audio manifest failed for ${params.bookCode}`,
          error,
        );
        return undefined;
      }),
    ],
  );

  if (translationResourcesResponse.truncated) {
    console.warn(
      `[prepareOfflineResources] manifest truncated for project ${projectId}`,
    );
  }

  let sourceAudioItems = (sourceAudioResponse?.items ?? []).map(
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
    ...sourceAudioItems,
    ...translationResourcesResponse.items.map(toMobileManifestItem),
  ];
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

  const responses = await Promise.all(
    contexts.map(({ bibleId: _bibleId, bookId: _bookId, ...params }) =>
      FluentAPI.getPrepareOfflineManifest(projectId, {
        ...params,
        includeContent: true,
      }),
    ),
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
