import type { ApiTranslationImageItem } from '../types/api/translationResources';
import type { ImagesMapsItem } from '../types/resources/imagesMaps';
import { FluentAPI } from './api';
import { findDownloadedRows } from './offlineResources';

const DEFAULT_IMAGES_LANGUAGE_CODE = 'eng';

export type LoadImagesMapsParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Aquifer language for Images (defaults to English source). */
  languageCode?: string;
  /** Active user id, needed to find this user's downloaded rows. */
  userId?: number | null;
  /** False when offline, so we never call the API. */
  isOnline?: boolean;
};

/** Test-only failure injection for section-scoped error/retry. */
let loadShouldFailForTests = false;

export function setImagesMapsLoadFailureForTests(shouldFail: boolean): void {
  loadShouldFailForTests = shouldFail;
}

/**
 * Map one fluent-api image item into a Resources-tab item.
 * fluent-api #274 returns title/url only (no caption/attribution); UI treats
 * those fields as optional.
 */
export function parseTranslationImageItem(
  item: ApiTranslationImageItem,
): ImagesMapsItem | null {
  const uri = item.url?.trim();
  if (!uri) {
    return null;
  }

  const title = (item.localizedName || item.title || '').trim();
  if (!title) {
    return null;
  }

  return {
    id: `img-api-${item.id}`,
    title,
    uri,
  };
}

/** Downloaded images for this chapter. Null = nothing downloaded. */
async function loadLocalImagesMaps(
  params: LoadImagesMapsParams,
  bookCode: string,
): Promise<ImagesMapsItem[] | null> {
  const rows = await findDownloadedRows({
    projectId: params.projectId,
    userId: params.userId,
    resourceName: 'Reference Images',
    kind: 'image',
    bookCode,
    chapterNumber: params.chapterNumber,
    // No verseNumber: downloaded images are chapter-level.
  });
  if (rows === null) return null;

  return rows.map(row => ({
    id: `img-local-${row.id}`,
    title: row.label,
    uri: row.localFilePath!,
  }));
}

/**
 * Load Images & Maps for a drafting unit. Downloaded images are used first;
 * fluent-api translation-resources (fluent-api #274) is only called when
 * nothing is downloaded and the device is online. Aquifer verse vs chapter
 * search scope is owned by the API.
 */
export async function loadImagesMapsForUnit(
  params: LoadImagesMapsParams,
): Promise<ImagesMapsItem[]> {
  if (loadShouldFailForTests) {
    throw new Error('Failed to load Images & Maps');
  }

  if (params.projectId === null) {
    return [];
  }

  const bookCode = params.bookCode.trim();
  if (!bookCode) {
    return [];
  }

  const local = await loadLocalImagesMaps(params, bookCode);
  if (local !== null) {
    return local;
  }
  // Offline and nothing downloaded: show empty, do not call the API.
  if (params.isOnline === false) {
    return [];
  }

  const languageCode =
    params.languageCode?.trim() || DEFAULT_IMAGES_LANGUAGE_CODE;

  const response = await FluentAPI.getTranslationImages(
    params.projectId,
    bookCode,
    params.chapterNumber,
    params.verseNumber,
    languageCode,
  );

  const items = Array.isArray(response?.items) ? response.items : [];
  return items
    .map(parseTranslationImageItem)
    .filter((item): item is ImagesMapsItem => item !== null);
}
