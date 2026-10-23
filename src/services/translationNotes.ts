import type { ApiTranslationNoteItem } from '../types/api/translationResources';
import type { TranslationNoteItem } from '../types/resources/translationNotes';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import {
  loadResourcesForVerseRange,
  normalizeVerseRefs,
  verseRefsFromChapter,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { FluentAPI } from './api';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';

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

function resolveTranslationNotesRefs(
  params: LoadTranslationNotesParams,
): ResourceVerseRef[] {
  return normalizeVerseRefs(
    params.verseRefs && params.verseRefs.length > 0
      ? params.verseRefs
      : verseRefsFromChapter(
          params.chapterNumber,
          params.verseNumber,
          params.verseNumbers,
        ),
  );
}

async function loadLocalTranslationNotesForRef(
  params: LoadTranslationNotesParams,
  bookCode: string,
  ref: ResourceVerseRef,
): Promise<TranslationNoteItem[] | null> {
  const rows = await findDownloadedRows({
    projectId: params.projectId,
    userId: params.userId,
    resourceName: 'Translation Notes',
    kind: 'text',
    bookCode,
    chapterNumber: ref.chapterNumber,
    verseNumber: ref.verseNumber,
  });
  if (rows === null) return null;

  const notes: TranslationNoteItem[] = [];
  let readAnyRow = false;
  for (const row of rows) {
    const content = await readDownloadedJson(row);
    if (content === undefined) continue;
    readAnyRow = true;
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
  // Every downloaded file was unreadable (missing/corrupt): fall back to the
  // API instead of showing an empty section.
  return readAnyRow ? notes : null;
}

function mergeNotesById(
  into: TranslationNoteItem[],
  next: TranslationNoteItem[],
  seenIds: Set<string>,
): void {
  for (const note of next) {
    if (seenIds.has(note.id)) continue;
    seenIds.add(note.id);
    into.push(note);
  }
}

/**
 * Load uW Translation Notes for a drafting unit. Downloaded rows are used
 * first (even online) for every verseRef in the unit; the fluent-api
 * translation-resources call (fluent-api #274) only runs for refs with no
 * usable local row, and only when online. Offline returns whatever was
 * downloaded without calling the API (#578 / #593).
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

  const refs = resolveTranslationNotesRefs(params);
  const localNotes: TranslationNoteItem[] = [];
  const missingRefs: ResourceVerseRef[] = [];
  const seenIds = new Set<string>();

  for (const ref of refs) {
    const local = await loadLocalTranslationNotesForRef(params, bookCode, ref);
    if (local !== null) {
      mergeNotesById(localNotes, local, seenIds);
    } else {
      missingRefs.push(ref);
    }
  }

  // Offline: return whatever was downloaded; never call the API.
  if (params.isOnline === false) {
    return localNotes;
  }

  if (missingRefs.length === 0) {
    return localNotes;
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TN_LANGUAGE_CODE;
  const projectId = params.projectId;
  const remote = await loadResourcesForVerseRange(missingRefs, async ref => {
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
  mergeNotesById(localNotes, remote, seenIds);
  return localNotes;
}
