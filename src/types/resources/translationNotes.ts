/** Aquifer Translation Note item for the Resources tab (#189). */
export interface TranslationNoteItem {
  id: string;
  /** Accordion title (resource / note name). */
  title: string;
  /** Plain-text body with paragraphs/lists flattened for mobile. */
  body: string;
  /** The phrase the note is about: the block's first line, when short. */
  quote?: string;
  /** The verse the note was loaded for. */
  verse?: { chapterNumber: number; verseNumber: number };
}
