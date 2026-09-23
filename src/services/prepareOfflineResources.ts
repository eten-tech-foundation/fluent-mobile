/**
 * Prepare for Offline — data access layer (#51 / #201 / #504).
 *
 * Single entry point for manifest and on-device inventory. UI, catalog builder,
 * and download service import from here — never from `src/mocks/prepareOffline/`.
 *
 * Manifest: real FluentAPI translation-resources + source-audio manifests (#504).
 * Download queue/worker/inventory: real since #201. The mock inventory runtime
 * remains only as the dev/QA status baseline behind this service boundary.
 */
import { FluentAPI } from './api';
import {
  clearMockPrepareOfflineRuntimeInventory,
  getMockPrepareOfflineResourceStatus,
  subscribeMockPrepareOfflineInventory,
} from '../mocks/prepareOffline';
import type { ApiPrepareOfflineManifestItem } from '../types/api/translationResources';
import type { ApiSourceAudioResponse } from '../types/api/sourceAudio';
import type { ApiSourceAudioManifestItem } from '../types/api/sourceAudio';
import {
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceStatus,
} from '../types/prepareOffline/types';
import { unscopedPrepareOfflineResourceId } from '../utils/prepareOfflineResourceId';

export type PrepareOfflineInventoryListener = () => void;

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
  startChapter: number;
  endChapter: number;
  bibleId: number;
}
export async function fetchPrepareOfflineManifest(
  projectId: number,
  params: FetchPrepareOfflineManifestParams,
): Promise<PrepareOfflineResourceManifestItem[]> {
  const { bibleId, ...translationResourcesParams } = params;

  const [translationResourcesResponse, sourceAudioResponse] = await Promise.all(
    [
      FluentAPI.getPrepareOfflineManifest(
        projectId,
        translationResourcesParams,
      ),
      FluentAPI.getSourceAudioManifest(projectId, params),
    ],
  );

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
    ...sourceAudioItems,
  ];
}

/** On-device / in-flight status for one resource row. */
export function getPrepareOfflineResourceStatus(
  projectId: number,
  resourceId: string,
): PrepareOfflineResourceStatus {
  return getMockPrepareOfflineResourceStatus(
    projectId,
    unscopedPrepareOfflineResourceId(projectId, resourceId),
  );
}

/** Subscribe to inventory changes (mock pub/sub baseline; queue events drive real progress). */
export function subscribePrepareOfflineInventory(
  listener: PrepareOfflineInventoryListener,
): () => void {
  return subscribeMockPrepareOfflineInventory(listener);
}

/**
 * Clear runtime inventory overrides (tests / explicit reset).
 * Do not call on Prepare Offline remount — completed downloads must survive
 * navigation so Resources can read the same in-session inventory.
 */
export function clearPrepareOfflineSessionInventory(): void {
  clearMockPrepareOfflineRuntimeInventory();
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
