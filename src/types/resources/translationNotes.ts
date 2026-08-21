/** Aquifer Translation Note item for the Resources tab (#189). */
export interface TranslationNoteItem {
  id: string;
  /** Accordion title (resource / note name). */
  title: string;
  /** Plain-text body with paragraphs/lists flattened for mobile. */
  body: string;
}
