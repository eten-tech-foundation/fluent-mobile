import type { AquiferResourceDetails } from '../types/api/aquifer';
import type { TranslationQuestionItem } from '../types/resources/translationQuestions';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import { AQUIFER_RESOURCE_COLLECTIONS } from './prepareOfflineResourceManifest';
import { AquiferAPI } from './aquiferApi';

const DEFAULT_TQ_LANGUAGE_CODE = 'eng';

export type LoadTranslationQuestionsParams = {
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
 * Parse one Aquifer TQ resource detail into Q/A items.
 * Matches fluent-web: first TipTap block = question, remaining = answer.
 */
export function parseAquiferTranslationQuestions(
  details: AquiferResourceDetails,
): TranslationQuestionItem[] {
  if (!isContentItemArray(details.content)) {
    return [];
  }

  const questions: TranslationQuestionItem[] = [];

  details.content.forEach((item, index) => {
    const doc = item.tiptap;
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
      .map(block => tipTapToPlainText(block).trim())
      .filter(Boolean)
      .join('\n\n');

    questions.push({
      id: `tq-aquifer-${details.id}-${index}`,
      question,
      answer,
    });
  });

  return questions;
}

/**
 * Load uW Translation Questions for a drafting unit from Aquifer.
 * Interim until fluent-api#273 proxies these payloads.
 */
export async function loadTranslationQuestionsForUnit(
  params: LoadTranslationQuestionsParams,
): Promise<TranslationQuestionItem[]> {
  if (loadShouldFailForTests) {
    throw new Error('Failed to load Translation Questions');
  }

  const bookCode = params.bookCode.trim();
  if (!bookCode) {
    throw new Error('bookCode is required to load Translation Questions');
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TQ_LANGUAGE_CODE;

  const search = await AquiferAPI.searchResources({
    bookCode,
    startChapter: params.chapterNumber,
    endChapter: params.chapterNumber,
    startVerse: params.verseNumber,
    endVerse: params.verseNumber,
    languageCode,
    resourceCollectionCode: AQUIFER_RESOURCE_COLLECTIONS.translationQuestions,
    limit: 50,
  });

  if (!search.items.length) {
    return [];
  }

  const detailsList = await Promise.all(
    search.items.map(item => AquiferAPI.getResourceDetails(item.id)),
  );

  return detailsList.flatMap(parseAquiferTranslationQuestions);
}
