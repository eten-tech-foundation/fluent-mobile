import type { ApiTranslationImageItem } from '../types/api/translationResources';
import type { ImagesMapsItem } from '../types/resources/imagesMaps';
import { FluentAPI } from './api';

const DEFAULT_IMAGES_LANGUAGE_CODE = 'eng';

export type LoadImagesMapsParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Aquifer language for Images (defaults to English source). */
  languageCode?: string;
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

/**
 * Load Images & Maps for a drafting unit via fluent-api translation-resources
 * (fluent-api #274). Aquifer verse vs chapter search scope is owned by the API
 * (client no longer falls back to chapter-wide search).
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
    .filter((mapped): mapped is ImagesMapsItem => mapped !== null);
}
