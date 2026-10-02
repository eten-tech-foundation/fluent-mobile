import type { ApiTranslationQuestionItem } from '../types/api/translationResources';
import type { TranslationQuestionItem } from '../types/resources/translationQuestions';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import { FluentAPI } from './api';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';

const DEFAULT_TQ_LANGUAGE_CODE = 'eng';

export type LoadTranslationQuestionsParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
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

/** Reads downloaded Translation Questions. Null = nothing downloaded. */
async function loadLocalTranslationQuestions(
  params: LoadTranslationQuestionsParams,
  bookCode: string,
): Promise<TranslationQuestionItem[] | null> {
  const rows = await findDownloadedRows({
    projectId: params.projectId,
    userId: params.userId,
    resourceName: 'Translation Questions',
    kind: 'text',
    bookCode,
    chapterNumber: params.chapterNumber,
    verseNumber: params.verseNumber,
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

/**
 * Load uW Translation Questions for a drafting unit. Downloaded rows are
 * used first (even online); the fluent-api translation-resources call
 * (fluent-api #274) only runs when nothing usable is downloaded and the
 * device is online.
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

  const local = await loadLocalTranslationQuestions(params, bookCode);
  if (local !== null) {
    return local;
  }
  // Offline and nothing downloaded: show empty, do not call the API.
  if (params.isOnline === false) {
    return [];
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TQ_LANGUAGE_CODE;

  const response = await FluentAPI.getTranslationQuestions(
    params.projectId,
    bookCode,
    params.chapterNumber,
    params.verseNumber,
    languageCode,
  );

  const items = Array.isArray(response?.items) ? response.items : [];
  return items.flatMap(parseTranslationQuestionsItem);
}
