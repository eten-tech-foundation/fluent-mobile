import { TranslationQuestionItem } from '../../types/resources/translationQuestions';

/**
 * Deterministic mock TQ payloads for the Resources tab (#190).
 * fluent-api has no TQ domain yet — replace with inventory/SQLite in #192.
 *
 * Aligns with `getMockResourcesForUnit`: questions only when verse % 3 === 2.
 */
export function getMockTranslationQuestions(
  chapterId: number,
  verseNumber: number,
): TranslationQuestionItem[] {
  if (verseNumber % 3 !== 2) {
    return [];
  }

  return [
    {
      id: `tq-${chapterId}-${verseNumber}-1`,
      question: 'What is happening in this verse?',
      answer:
        'The passage describes the events surrounding this verse so the translator can check key meaning.',
    },
    {
      id: `tq-${chapterId}-${verseNumber}-2`,
      question: 'Who is speaking or acting here?',
      answer:
        'Identify the main person or group so names and pronouns stay clear in the translation.',
    },
    {
      id: `tq-${chapterId}-${verseNumber}-3`,
      question: 'What important idea should not be left out?',
      answer: '',
    },
  ];
}

/** Test-only failure injection for section-scoped error/retry. */
let mockLoadShouldFail = false;

export function setMockTranslationQuestionsLoadFailure(shouldFail: boolean) {
  mockLoadShouldFail = shouldFail;
}

/**
 * Async loader for TQ content. No network — mock only until fluent-api exists.
 */
export async function loadTranslationQuestionsForUnit(
  chapterId: number,
  verseNumber: number,
): Promise<TranslationQuestionItem[]> {
  await Promise.resolve();
  if (mockLoadShouldFail) {
    throw new Error('Failed to load Translation Questions');
  }
  return getMockTranslationQuestions(chapterId, verseNumber);
}
