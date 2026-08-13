/**
 * Deterministic TQ fixtures for unit tests (#190).
 * Production loads Aquifer via `services/translationQuestions`.
 */
import { TranslationQuestionItem } from '../../types/resources/translationQuestions';

export { setTranslationQuestionsLoadFailureForTests as setMockTranslationQuestionsLoadFailure } from '../../services/translationQuestions';

/**
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
