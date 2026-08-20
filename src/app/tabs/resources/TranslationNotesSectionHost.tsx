import React from 'react';
import type { TranslationNotesLoadState } from '../../../hooks/useTranslationNotesForUnit';

type TranslationNotesSectionHostProps = {
  state: TranslationNotesLoadState | undefined;
  retry: () => void;
  sectionExpanded: boolean;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
};

/**
 * Lazily require the TN body so a Metro HMR / module-graph glitch in
 * `TranslationNotesSection` cannot make ResourcesTab crash on
 * `TranslationNotesSection` of undefined (same pattern as ImagesMapsSectionHost).
 */
export function TranslationNotesSectionHost(
  props: TranslationNotesSectionHostProps,
) {
  const { TranslationNotesSection } =
    require('./TranslationNotesSection') as typeof import('./TranslationNotesSection');
  return <TranslationNotesSection {...props} />;
}
