import type { ApiTranslationNoteItem } from '../types/api/translationResources';
import type { TranslationNoteItem } from '../types/resources/translationNotes';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import { FluentAPI } from './api';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';
import { logger } from '../utils/logger';

const log = logger.create('translationNotes');
const DEFAULT_TN_LANGUAGE_CODE = 'eng';

export type LoadTranslationNotesParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Aquifer language for uW TN (defaults to English source). */
  languageCode?: string;
  /** Active user id, needed to find this user's downloaded rows. */
  userId?: number | null;
  /** False when offline, so we never call the API. */
  isOnline?: boolean;
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

async function loadLocalTranslationNotes(
  params: LoadTranslationNotesParams,
  bookCode: string,
): Promise<TranslationNoteItem[] | null> {
  const rows = await findDownloadedRows({
    projectId: params.projectId,
    userId: params.userId,
    resourceName: 'Translation Notes',
    kind: 'text',
    bookCode,
    chapterNumber: params.chapterNumber,
    verseNumber: params.verseNumber,
  });
  if (rows === null) return null;

  const notes: TranslationNoteItem[] = [];
  for (const row of rows) {
    const content = await readDownloadedJson(row);
    if (content === undefined) continue;
    const item = {
      id: row.resourceId ?? row.id,
      name: row.label,
      localizedName: row.label,
      // JSON.parse yields whatever was persisted — the API content shape is a
      // TipTap block array, so rewrap non-arrays to keep the parser happy.
      content: Array.isArray(content) ? content : [content],
    } as unknown as ApiTranslationNoteItem;
    notes.push(...parseTranslationNotesItem(item));
  }
  return notes;
}

/**
 * Load uW Translation Notes for a drafting unit via fluent-api
 * translation-resources (fluent-api #274).
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

  const local = await loadLocalTranslationNotes(params, bookCode);
  if (local !== null) {
    return local;
  }
  // Offline and nothing downloaded: show empty, do not call the API.
  if (params.isOnline === false) {
    return [];
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TN_LANGUAGE_CODE;

  const response = await FluentAPI.getTranslationNotes(
    params.projectId,
    bookCode,
    params.chapterNumber,
    params.verseNumber,
    languageCode,
  );

  const items = Array.isArray(response?.items) ? response.items : [];
  return items.flatMap(parseTranslationNotesItem);
}
