import type { ApiTranslationQuestionItem } from '../types/api/translationResources';
import type { TranslationQuestionItem } from '../types/resources/translationQuestions';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import {
  loadResourcesForVerseRange,
  normalizeVerseRefs,
  verseRefsFromChapter,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { FluentAPI } from './api';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';

const DEFAULT_TQ_LANGUAGE_CODE = 'eng';

export type LoadTranslationQuestionsParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Same-chapter verse list for fan-out (#593). Prefer `verseRefs` for ranges. */
  verseNumbers?: number[];
  /** Explicit chapter+verse refs (cross-chapter pericopes). */
  verseRefs?: ResourceVerseRef[];
  /** Aquifer language for uW TQ (defaults to English source). */
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

export function setTranslationQuestionsLoadFailureForTests(
  shouldFail: boolean,
): void {
  loadShouldFailForTests = shouldFail;
}

function isContentItemArray(value: unknown): value is TipTapContentItem[] {
  return Array.isArray(value);
}

/**
 * Parse one fluent-api TQ item into Q/A items.
 * Matches fluent-web: first TipTap block = question, remaining = answer.
 */
export function parseTranslationQuestionsItem(
  item: ApiTranslationQuestionItem,
): TranslationQuestionItem[] {
  if (!isContentItemArray(item.content)) {
    return [];
  }

  const questions: TranslationQuestionItem[] = [];

  item.content.forEach((block, index) => {
    const doc = block.tiptap;
    if (
      !doc ||
      typeof doc !== 'object' ||
      !('content' in doc) ||
      !Array.isArray((doc as { content: unknown }).content)
    ) {
      return;
    }

    const blocks = (doc as { content: unknown[] }).content;
    if (blocks.length === 0) {
      return;
    }

    const question = tipTapToPlainText(blocks[0]).trim();
    if (!question) {
      return;
    }

    const answer = blocks
      .slice(1)
      .map(answerBlock => tipTapToPlainText(answerBlock).trim())
      .filter(Boolean)
      .join('\n\n');

    questions.push({
      id: `tq-api-${item.id}-${index}`,
      question,
      answer,
    });
  });

  return questions;
}

function resolveTranslationQuestionsRefs(
  params: LoadTranslationQuestionsParams,
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

/** Reads downloaded Translation Questions for one verse. Null = nothing downloaded. */
async function loadLocalTranslationQuestionsForRef(
  params: LoadTranslationQuestionsParams,
  bookCode: string,
  ref: ResourceVerseRef,
): Promise<TranslationQuestionItem[] | null> {
  const rows = await findDownloadedRows({
    projectId: params.projectId,
    userId: params.userId,
    resourceName: 'Translation Questions',
    kind: 'text',
    bookCode,
    chapterNumber: ref.chapterNumber,
    verseNumber: ref.verseNumber,
  });
  if (rows === null) return null;

  const questions: TranslationQuestionItem[] = [];
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
    } as unknown as ApiTranslationQuestionItem;
    questions.push(...parseTranslationQuestionsItem(item));
  }
  // Every downloaded file was unreadable (missing/corrupt): fall back to the
  // API instead of showing an empty section.
  return readAnyRow ? questions : null;
}

function mergeQuestionsById(
  into: TranslationQuestionItem[],
  next: TranslationQuestionItem[],
  seenIds: Set<string>,
): void {
  for (const question of next) {
    if (seenIds.has(question.id)) continue;
    seenIds.add(question.id);
    into.push(question);
  }
}

/**
 * Load uW Translation Questions for a drafting unit. Downloaded rows are
 * used first (even online) for every verseRef in the unit; the fluent-api
 * translation-resources call (fluent-api #274) only runs for refs with no
 * usable local row, and only when online. Offline returns whatever was
 * downloaded without calling the API (#578 / #593).
 */
export async function loadTranslationQuestionsForUnit(
  params: LoadTranslationQuestionsParams,
): Promise<TranslationQuestionItem[]> {
  if (loadShouldFailForTests) {
    throw new Error('Failed to load Translation Questions');
  }

  if (params.projectId === null) {
    return [];
  }

  const bookCode = params.bookCode.trim();
  if (!bookCode) {
    return [];
  }

  const refs = resolveTranslationQuestionsRefs(params);
  const localQuestions: TranslationQuestionItem[] = [];
  const missingRefs: ResourceVerseRef[] = [];
  const seenIds = new Set<string>();

  for (const ref of refs) {
    const local = await loadLocalTranslationQuestionsForRef(
      params,
      bookCode,
      ref,
    );
    if (local !== null) {
      mergeQuestionsById(localQuestions, local, seenIds);
    } else {
      missingRefs.push(ref);
    }
  }

  // Offline: return whatever was downloaded; never call the API.
  if (params.isOnline === false) {
    return localQuestions;
  }

  if (missingRefs.length === 0) {
    return localQuestions;
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TQ_LANGUAGE_CODE;
  const projectId = params.projectId;
  const remote = await loadResourcesForVerseRange(missingRefs, async ref => {
    const response = await FluentAPI.getTranslationQuestions(
      projectId,
      bookCode,
      ref.chapterNumber,
      ref.verseNumber,
      languageCode,
    );
    const items = Array.isArray(response?.items) ? response.items : [];
    return items.flatMap(parseTranslationQuestionsItem);
  });
  mergeQuestionsById(localQuestions, remote, seenIds);
  return localQuestions;
}
