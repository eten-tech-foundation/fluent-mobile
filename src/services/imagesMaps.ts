import type { AquiferResourceDetails } from '../types/api/aquifer';
import type { ImagesMapsItem } from '../types/resources/imagesMaps';
import { AquiferAPI } from './aquiferApi';

const DEFAULT_IMAGES_LANGUAGE_CODE = 'eng';

export type LoadImagesMapsParams = {
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Aquifer language for Images (defaults to English source). */
  languageCode?: string;
};

type AquiferImageContent = {
  url?: unknown;
};

type AquiferLicenseInfo = {
  copyright?: {
    holder?: {
      name?: unknown;
    };
  };
  title?: unknown;
};

/** Test-only failure injection for section-scoped error/retry. */
let loadShouldFailForTests = false;

export function setImagesMapsLoadFailureForTests(shouldFail: boolean): void {
  loadShouldFailForTests = shouldFail;
}

function contentUrl(content: unknown): string | null {
  if (!content || typeof content !== 'object') {
    return null;
  }
  const url = (content as AquiferImageContent).url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

function attributionFromDetails(
  details: AquiferResourceDetails,
): string | undefined {
  const license = details.grouping.licenseInfo as
    | AquiferLicenseInfo
    | undefined;
  const holder = license?.copyright?.holder?.name;
  if (typeof holder === 'string' && holder.trim()) {
    return holder.trim();
  }
  const title = license?.title;
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }
  return undefined;
}

/**
 * Map one Aquifer image resource detail into a Resources-tab item.
 */
export function parseAquiferImagesMapsItem(
  details: AquiferResourceDetails,
): ImagesMapsItem | null {
  const uri = contentUrl(details.content);
  if (!uri) {
    return null;
  }

  const title = (details.localizedName || details.name || '').trim();
  if (!title) {
    return null;
  }

  const caption = details.grouping.name?.trim() || undefined;
  const attribution = attributionFromDetails(details);

  return {
    id: `img-aquifer-${details.id}`,
    title,
    caption,
    attribution,
    uri,
  };
}

/**
 * Load Images & Maps for a drafting unit from Aquifer.
 * Interim until fluent-api#273 proxies these payloads.
 */
export async function loadImagesMapsForUnit(
  params: LoadImagesMapsParams,
): Promise<ImagesMapsItem[]> {
  if (loadShouldFailForTests) {
    throw new Error('Failed to load Images & Maps');
  }

  const bookCode = params.bookCode.trim();
  if (!bookCode) {
    throw new Error('bookCode is required to load Images & Maps');
  }

  const languageCode =
    params.languageCode?.trim() || DEFAULT_IMAGES_LANGUAGE_CODE;

  const search = await AquiferAPI.searchResources({
    bookCode,
    startChapter: params.chapterNumber,
    endChapter: params.chapterNumber,
    startVerse: params.verseNumber,
    endVerse: params.verseNumber,
    languageCode,
    resourceType: 'Images',
    limit: 100,
  });

  if (!search.items.length) {
    return [];
  }

  const detailsList = await Promise.all(
    search.items.map(item => AquiferAPI.getResourceDetails(item.id)),
  );

  return detailsList
    .map(parseAquiferImagesMapsItem)
    .filter((item): item is ImagesMapsItem => item !== null);
}
