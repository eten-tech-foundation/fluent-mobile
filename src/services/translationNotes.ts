import type { ApiTranslationNoteItem } from '../types/api/translationResources';
import type { TranslationNoteItem } from '../types/resources/translationNotes';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import {
  loadResourcesForVerseRange,
  verseRefsFromChapter,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { FluentAPI } from './api';

const DEFAULT_TN_LANGUAGE_CODE = 'eng';

export type LoadTranslationNotesParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /**
   * Same-chapter verse list for fan-out (#593). Prefer `verseRefs` when the
   * unit may span chapters.
   */
  verseNumbers?: number[];
  /** Explicit chapter+verse refs (cross-chapter pericopes). */
  verseRefs?: ResourceVerseRef[];
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
 * Parse one fluent-api TN item into note items.
 * Each TipTap content block becomes a nested note; title falls back to the
 * resource localized name when a block has no leading heading text.
 */
export function parseTranslationNotesItem(
  item: ApiTranslationNoteItem,
): TranslationNoteItem[] {
  if (!isContentItemArray(item.content)) {
    return [];
  }

  const resourceTitle = (item.localizedName || item.name || '').trim();
  const contentItems = item.content;
  const notes: TranslationNoteItem[] = [];

  contentItems.forEach((block, index) => {
    const body = tipTapToPlainText(block.tiptap).trim();
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
      id: `tn-api-${item.id}-${index}`,
      title,
      body: noteBody || body,
    });
  });

  return notes;
}

/**
 * Load uW Translation Notes for a drafting unit via fluent-api
 * translation-resources (fluent-api #274). Pericope units fan out (#593).
 */
export async function loadTranslationNotesForUnit(
  params: LoadTranslationNotesParams,
): Promise<TranslationNoteItem[]> {
  if (loadShouldFailForTests) {
    throw new Error('Failed to load Translation Notes');
  }

  if (params.projectId === null) {
    return [];
  }

  const bookCode = params.bookCode.trim();
  // Missing bookCode (e.g. chapter row without USFM code) → hide section, not error.
  if (!bookCode) {
    return [];
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TN_LANGUAGE_CODE;
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
    const response = await FluentAPI.getTranslationNotes(
      projectId,
      bookCode,
      ref.chapterNumber,
      ref.verseNumber,
      languageCode,
    );
    const items = Array.isArray(response?.items) ? response.items : [];
    return items.flatMap(parseTranslationNotesItem);
  });
}
