import type {
  AquiferBible,
  AquiferResourceDetails,
  AquiferResourceMediaType,
  AquiferResourceSearchItem,
  AquiferResourceType,
} from '../types/api/aquifer';
import type {
  PrepareOfflineChapterRow,
  PrepareOfflineResourceManifest,
  PrepareOfflineResourceManifestItem,
  PrepareOfflineResourceTier,
} from '../types/prepareOffline/types';
import { AquiferAPI } from './aquiferApi';

export const AQUIFER_RESOURCE_COLLECTIONS = {
  translationNotes: 'UWTranslationNotes',
  translationWords: 'UWTranslationWords',
  translationQuestions: 'UWTranslationQuestions',
} as const;

type ChapterRange = {
  bookCode: string;
  startChapter: number;
  endChapter: number;
};

type ResourceSearchConfig = {
  tier: PrepareOfflineResourceTier;
  resourceName: string;
  required: boolean;
  collectionCode?: string;
  resourceType?: AquiferResourceType;
};
/**

 * NOTE:
 * - Tier 1 Source Bible Text is provided by the Fluent API.
 * - Tier 1 Source Audio is to be provided by DBL.
 */
const RESOURCE_SEARCH_CONFIGS: ResourceSearchConfig[] = [
  {
    tier: 2,
    resourceName: 'Translation Notes',
    required: true,
    collectionCode: AQUIFER_RESOURCE_COLLECTIONS.translationNotes,
  },
  {
    tier: 2,
    resourceName: 'Translation Words',
    required: false,
    collectionCode: AQUIFER_RESOURCE_COLLECTIONS.translationWords,
  },
  {
    tier: 2,
    resourceName: 'Translation Questions',
    required: false,
    collectionCode: AQUIFER_RESOURCE_COLLECTIONS.translationQuestions,
  },
  {
    tier: 3,
    resourceName: 'Bible Commentary',
    required: false,
    resourceType: 'StudyNotes',
  },
  {
    tier: 3,
    resourceName: 'Reference Images',
    required: false,
    resourceType: 'Images',
  },
];

function selectedChapterRanges(
  chapters: PrepareOfflineChapterRow[],
): ChapterRange[] {
  const byBook = new Map<string, number[]>();
  for (const chapter of chapters) {
    const existing = byBook.get(chapter.bookCode) ?? [];
    existing.push(chapter.chapterNumber);
    byBook.set(chapter.bookCode, existing);
  }

  const ranges: ChapterRange[] = [];
  for (const [bookCode, chapterNumbers] of byBook) {
    const sorted = [...new Set(chapterNumbers)].sort((a, b) => a - b);
    let start = sorted[0];
    let previous = sorted[0];
    if (start === undefined || previous === undefined) continue;

    for (const chapterNumber of sorted.slice(1)) {
      if (chapterNumber === previous + 1) {
        previous = chapterNumber;
        continue;
      }
      ranges.push({ bookCode, startChapter: start, endChapter: previous });
      start = chapterNumber;
      previous = chapterNumber;
    }
    ranges.push({ bookCode, startChapter: start, endChapter: previous });
  }

  return ranges;
}

function jsonByteLength(value: unknown): { json: string; bytes: number } {
  const json = JSON.stringify(value);
  return { json, bytes: utf8ByteLength(json) };
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0;
    if (codePoint > 0xffff) {
      index += 1;
    }
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstStringField(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (!isRecord(value)) return undefined;
  const direct = value[fieldName];
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }
  for (const child of Object.values(value)) {
    const found = firstStringField(child, fieldName);
    if (found) return found;
  }
  return undefined;
}

function firstNumberField(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (!isRecord(value)) return undefined;
  const direct = value[fieldName];
  if (typeof direct === 'number') {
    return direct;
  }
  for (const child of Object.values(value)) {
    const found = firstNumberField(child, fieldName);
    if (found !== undefined) return found;
  }
  return undefined;
}

function fileExtFromUrl(url: string, fallback: string): string {
  const clean = url.split('?')[0] ?? url;
  const ext = clean.split('.').pop()?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : fallback;
}

function kindForMediaType(
  mediaType: AquiferResourceMediaType,
): PrepareOfflineResourceManifestItem['kind'] {
  if (mediaType === 'Audio') return 'audio';
  if (mediaType === 'Image') return 'image';
  return 'text';
}

function mediaFallbackExt(mediaType: AquiferResourceMediaType): string {
  if (mediaType === 'Audio') return 'mp3';
  if (mediaType === 'Image') return 'jpg';
  return 'json';
}

function buildResourceItem(params: {
  config: ResourceSearchConfig;
  searchItem: AquiferResourceSearchItem;
  details: AquiferResourceDetails;
  languageCode: string;
  range: ChapterRange;
}): PrepareOfflineResourceManifestItem {
  const { config, searchItem, details, languageCode, range } = params;
  const kind = kindForMediaType(searchItem.mediaType);
  const sourceUrl =
    kind === 'text' ? undefined : firstStringField(details.content, 'url');
  const serialized = kind === 'text' ? jsonByteLength(details) : undefined;
  const bytesTotal =
    kind === 'text'
      ? serialized?.bytes ?? 0
      : firstNumberField(details.content, 'size') ?? 0;

  return {
    id: `aquifer-${searchItem.id}-${kind}`,
    tier: config.tier,
    kind,
    resourceName: config.resourceName,
    label: searchItem.localizedName || searchItem.name,
    required: config.required,
    removable: !config.required,
    bytesTotal,
    sourceUrl,
    fileExt: sourceUrl
      ? fileExtFromUrl(sourceUrl, mediaFallbackExt(searchItem.mediaType))
      : 'json',
    aquiferContentId: searchItem.id,
    languageCode,
    bookCode: range.bookCode,
    startChapter: range.startChapter,
    endChapter: range.endChapter,
    collectionCode: config.collectionCode ?? searchItem.grouping.collectionCode,
    resourceType: config.resourceType ?? searchItem.grouping.type,
    serializedContent: serialized?.json,
  };
}

function buildBibleTextItem(params: {
  bible: AquiferBible;
  bibleText: unknown;
  languageCode: string;
  range: ChapterRange;
}): PrepareOfflineResourceManifestItem {
  const { bible, bibleText, languageCode, range } = params;
  const serialized = jsonByteLength(bibleText);
  return {
    id: `aquifer-bible-${bible.id}-${range.bookCode}-${range.startChapter}-${range.endChapter}`,
    tier: 3,
    kind: 'text',
    resourceName: 'Alternate Translations',
    label: `${bible.abbreviation} - ${bible.name}`,
    required: false,
    removable: true,
    bytesTotal: serialized.bytes,
    fileExt: 'json',
    aquiferBibleId: bible.id,
    languageCode,
    bookCode: range.bookCode,
    startChapter: range.startChapter,
    endChapter: range.endChapter,
    resourceType: 'Bibles',
    serializedContent: serialized.json,
  };
}

async function resourceSearchItemsForRange(params: {
  config: ResourceSearchConfig;
  languageCode: string;
  range: ChapterRange;
}): Promise<PrepareOfflineResourceManifestItem[]> {
  const { config, languageCode, range } = params;
  const allItems: AquiferResourceSearchItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await AquiferAPI.searchResources({
      bookCode: range.bookCode,
      startChapter: range.startChapter,
      endChapter: range.endChapter,
      startVerse: 1,
      endVerse: 200,
      languageCode,
      resourceCollectionCode: config.collectionCode,
      resourceType: config.resourceType,
      limit,
      offset,
    });

    allItems.push(...response.items);

    const nextOffset = offset + response.returnedItemCount;
    if (
      response.returnedItemCount === 0 ||
      nextOffset >= response.totalItemCount ||
      nextOffset <= offset
    ) {
      break;
    }
    offset = nextOffset;
  }

  const details = await Promise.all(
    allItems.map(async item => ({
      item,
      details: await AquiferAPI.getResourceDetails(item.id),
    })),
  );

  return details.map(({ item, details: resourceDetails }) =>
    buildResourceItem({
      config,
      searchItem: item,
      details: resourceDetails,
      languageCode,
      range,
    }),
  );
}

async function bibleItemsForRanges(
  languageCode: string,
  ranges: ChapterRange[],
): Promise<PrepareOfflineResourceManifestItem[]> {
  const bibles = await AquiferAPI.getBibles(languageCode);
  const items: PrepareOfflineResourceManifestItem[] = [];

  for (const bible of bibles) {
    for (const range of ranges) {
      const bibleText = await AquiferAPI.getBibleText(
        bible.id,
        range.bookCode,
        range.startChapter,
        range.endChapter,
      );
      if (bibleText.chapters.length === 0) {
        continue;
      }
      items.push(buildBibleTextItem({ bible, bibleText, languageCode, range }));
    }
  }

  return items;
}

export async function buildPrepareOfflineResourceManifest(params: {
  projectId: number;
  sourceLanguageCode: string;
  chapters: PrepareOfflineChapterRow[];
}): Promise<PrepareOfflineResourceManifest> {
  const ranges = selectedChapterRanges(params.chapters);
  const items: PrepareOfflineResourceManifestItem[] = [];

  for (const range of ranges) {
    for (const config of RESOURCE_SEARCH_CONFIGS) {
      items.push(
        ...(await resourceSearchItemsForRange({
          config,
          languageCode: params.sourceLanguageCode,
          range,
        })),
      );
    }
  }

  items.push(...(await bibleItemsForRanges(params.sourceLanguageCode, ranges)));

  return {
    projectId: params.projectId,
    sourceLanguageCode: params.sourceLanguageCode,
    items: items.sort((a, b) => a.tier - b.tier),
    totalBytes: items.reduce((sum, item) => sum + item.bytesTotal, 0),
  };
}
