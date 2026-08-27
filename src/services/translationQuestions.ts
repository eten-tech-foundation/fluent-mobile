import type { ApiTranslationQuestionItem } from '../types/api/translationResources';
import type { TranslationQuestionItem } from '../types/resources/translationQuestions';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import { FluentAPI } from './api';

const DEFAULT_TQ_LANGUAGE_CODE = 'eng';

export type LoadTranslationQuestionsParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Aquifer language for uW TQ (defaults to English source). */
  languageCode?: string;
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

/**
 * Load uW Translation Questions for a drafting unit via fluent-api
 * translation-resources (fluent-api #274).
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
