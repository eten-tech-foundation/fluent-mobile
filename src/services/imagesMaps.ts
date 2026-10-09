import type {
  ApiTranslationImageItem,
  ApiTranslationImageLicenseInfo,
} from '../types/api/translationResources';
import type { ImagesMapsItem } from '../types/resources/imagesMaps';
import {
  loadResourcesForVerseRange,
  verseRefsFromChapter,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { FluentAPI } from './api';

const DEFAULT_IMAGES_LANGUAGE_CODE = 'eng';

export type LoadImagesMapsParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Same-chapter verse list for fan-out (#593). Prefer `verseRefs` for ranges. */
  verseNumbers?: number[];
  /** Explicit chapter+verse refs (cross-chapter pericopes). */
  verseRefs?: ResourceVerseRef[];
  /** Aquifer language for Images (defaults to English source). */
  languageCode?: string;
};

/** Test-only failure injection for section-scoped error/retry. */
let loadShouldFailForTests = false;

export function setImagesMapsLoadFailureForTests(shouldFail: boolean): void {
  loadShouldFailForTests = shouldFail;
}

/**
 * Build a short attribution line from fluent-api / Aquifer licenseInfo (#594).
 * Returns undefined when nothing useful is present.
 */
export function formatImageLicenseAttribution(
  licenseInfo: ApiTranslationImageItem['licenseInfo'],
): string | undefined {
  if (!licenseInfo || typeof licenseInfo !== 'object') {
    return undefined;
  }
  const info = licenseInfo as ApiTranslationImageLicenseInfo;
  const parts: string[] = [];
  if (typeof info.title === 'string' && info.title.trim()) {
    parts.push(info.title.trim());
  }
  const holder = info.copyright?.holder?.name;
  if (typeof holder === 'string' && holder.trim()) {
    parts.push(holder.trim());
  }
  const dates = info.copyright?.dates;
  if (typeof dates === 'string' && dates.trim()) {
    parts.push(dates.trim());
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(' · ');
}

/**
 * Map one fluent-api image item into a Resources-tab item (#191 / #594).
 * Caption / attribution / licenseInfo are optional until fluent-api exposes
 * them on the verse images endpoint; thumbnailUrl is used for list previews.
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

  const caption = item.caption?.trim() || undefined;
  const attribution =
    item.attribution?.trim() || formatImageLicenseAttribution(item.licenseInfo);
  const thumbnailUri = item.thumbnailUrl?.trim() || undefined;

  return {
    id: `img-api-${item.id}`,
    title,
    uri,
    ...(caption ? { caption } : {}),
    ...(attribution ? { attribution } : {}),
    ...(thumbnailUri && thumbnailUri !== uri ? { thumbnailUri } : {}),
  };
}

/**
 * Load Images & Maps for a drafting unit via fluent-api translation-resources
 * (fluent-api #274). Pericope units fan out (#593). Aquifer verse vs chapter
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

  const languageCode =
    params.languageCode?.trim() || DEFAULT_IMAGES_LANGUAGE_CODE;
  const projectId = params.projectId;
  const refs =
    params.verseRefs && params.verseRefs.length > 0
      ? params.verseRefs
      : verseRefsFromChapter(
          params.chapterNumber,
          params.verseNumber,
          params.verseNumbers,
        );

  return loadResourcesForVerseRange(refs, async ref => {
    const response = await FluentAPI.getTranslationImages(
      projectId,
      bookCode,
      ref.chapterNumber,
      ref.verseNumber,
      languageCode,
    );
    const items = Array.isArray(response?.items) ? response.items : [];
    return items
      .map(parseTranslationImageItem)
      .filter((item): item is ImagesMapsItem => item !== null);
  });
}
