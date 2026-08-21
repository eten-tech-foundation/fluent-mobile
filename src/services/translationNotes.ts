import type { AquiferResourceDetails } from '../types/api/aquifer';
import type { TranslationNoteItem } from '../types/resources/translationNotes';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import { AQUIFER_RESOURCE_COLLECTIONS } from './prepareOfflineResourceManifest';
import { AquiferAPI } from './aquiferApi';

const DEFAULT_TN_LANGUAGE_CODE = 'eng';

export type LoadTranslationNotesParams = {
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Aquifer language for uW TN (defaults to English source). */
  languageCode?: string;
};

type TipTapContentItem = {
  tiptap?: unknown;
};

/** Test-only failure injection for section-scoped error/retry. */
let loadShouldFailForTests = false;

export function setTranslationNotesLoadFailureForTests(
  shouldFail: boolean,
): void {
  loadShouldFailForTests = shouldFail;
}

function isContentItemArray(value: unknown): value is TipTapContentItem[] {
  return Array.isArray(value);
}

/**
 * Parse one Aquifer TN resource detail into note items.
 * Each TipTap content block becomes a nested note; title falls back to the
 * resource localized name when a block has no leading heading text.
 */
export function parseAquiferTranslationNotes(
  details: AquiferResourceDetails,
): TranslationNoteItem[] {
  if (!isContentItemArray(details.content)) {
    return [];
  }

  const resourceTitle = (details.localizedName || details.name || '').trim();
  const contentItems = details.content;
  const notes: TranslationNoteItem[] = [];

  contentItems.forEach((item, index) => {
    const body = tipTapToPlainText(item.tiptap).trim();
    if (!body) {
      return;
    }

    const firstLine =
      body
        .split('\n')
        .find(line => line.trim())
        ?.trim() ?? '';
    const useResourceTitle = contentItems.length === 1 && resourceTitle;
    const title = useResourceTitle
      ? resourceTitle
      : firstLine.length > 0 && firstLine.length <= 120
      ? firstLine
      : resourceTitle || `Note ${index + 1}`;

    const noteBody =
      !useResourceTitle && title === firstLine && body.startsWith(firstLine)
        ? body.slice(firstLine.length).trim()
        : body;

    notes.push({
      id: `tn-aquifer-${details.id}-${index}`,
      title,
      body: noteBody || body,
    });
  });

  return notes;
}

/**
 * Load uW Translation Notes for a drafting unit from Aquifer.
 * Interim until fluent-api#273 proxies these payloads.
 */
export async function loadTranslationNotesForUnit(
  params: LoadTranslationNotesParams,
): Promise<TranslationNoteItem[]> {
  if (loadShouldFailForTests) {
    throw new Error('Failed to load Translation Notes');
  }

  const bookCode = params.bookCode.trim();
  // Missing bookCode (e.g. chapter row without USFM code) → hide section, not error.
  if (!bookCode) {
    return [];
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TN_LANGUAGE_CODE;

  const search = await AquiferAPI.searchResources({
    bookCode,
    startChapter: params.chapterNumber,
    endChapter: params.chapterNumber,
    startVerse: params.verseNumber,
    endVerse: params.verseNumber,
    languageCode,
    resourceCollectionCode: AQUIFER_RESOURCE_COLLECTIONS.translationNotes,
    limit: 50,
  });

  // Aquifer can return 200 with an empty/`{}` body (parsed as `{}`) or omit
  // `items` on unexpected payloads — treat as no notes, not a crash.
  const items = Array.isArray(search?.items) ? search.items : [];
  if (items.length === 0) {
    return [];
  }

  const detailsList = await Promise.all(
    items.map(item => AquiferAPI.getResourceDetails(item.id)),
  );

  return detailsList.flatMap(parseAquiferTranslationNotes);
}
