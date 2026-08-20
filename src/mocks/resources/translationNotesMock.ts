/**
 * Deterministic TN fixtures for unit tests (#189).
 * Production loads Aquifer via `services/translationNotes`.
 */
import { TranslationNoteItem } from '../../types/resources/translationNotes';

/**
 * Aligns with `getMockResourcesForUnit`: notes when verse % 3 === 1 or 2.
 */
export function getMockTranslationNotes(
  chapterId: number,
  verseNumber: number,
): TranslationNoteItem[] {
  if (verseNumber % 3 === 0) {
    return [];
  }

  return [
    {
      id: `tn-${chapterId}-${verseNumber}-1`,
      title: 'connecting word',
      body: 'This phrase connects the current verse to the previous one.',
    },
    {
      id: `tn-${chapterId}-${verseNumber}-2`,
      title: 'Important name',
      body: 'Translate this name consistently with earlier uses in the book.',
    },
  ];
}
