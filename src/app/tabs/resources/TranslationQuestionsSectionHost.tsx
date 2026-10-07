import React from 'react';
import type { TranslationQuestionsLoadState } from '../../../hooks/useTranslationQuestionsForUnit';

type TranslationQuestionsSectionHostProps = {
  state: TranslationQuestionsLoadState | undefined;
  retry: () => void;
  sectionExpanded: boolean;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
};

/**
 * Lazily require the TQ body so a Metro HMR / module-graph glitch in
 * `TranslationQuestionsSection` cannot make ResourcesTab crash (same
 * pattern as TranslationNotesSectionHost).
 */
export function TranslationQuestionsSectionHost(
  props: TranslationQuestionsSectionHostProps,
) {
  const { TranslationQuestionsSection } =
    require('./TranslationQuestionsSection') as typeof import('./TranslationQuestionsSection');
  return <TranslationQuestionsSection {...props} />;
}
