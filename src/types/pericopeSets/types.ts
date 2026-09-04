/**
 * Bundled pericope set types (#447).
 *
 * Raw row shapes mirror the source exports as-is (FCBH-All-Books.json /
 * FIA-All-Books.json, same files as fluent-api's data/ directory) --
 * bundled unmodified, no build-time preprocessing. Normalization to a
 * common shape happens at read time in pericopeSets.ts.
 */

export interface RawFiaPericopeRow {
  book: string;
  chapter: number;
  verse: number;
  fia_pericope_number: string;
  fia_pericope_title: string | null;
}

export interface RawFcbhPericopeRow {
  book: string;
  chapter: number;
  verse: number;
  fcbh_section: number;
  fcbh_pericope_number: number;
}

/** Common normalized shape returned by the loader, regardless of source. */
export interface BundledPericopeVerse {
  chapterNumber: number;
  verseNumber: number;
  pericopeNumber: string;
  pericopeTitle: string | null;
}
