/**
 * GET /translated-verses response (fluent-api main / pinned 4bccdc12).
 * `markers` may be null when the server `.catch(null)`s invalid/missing JSON.
 */

export interface TranslatedVerseHeading {
  marker: string;
  text?: string;
}

export interface TranslatedVerseParagraphMarker {
  marker: string;
  offset: number;
}

export interface TranslatedVerseMarkers {
  headings?: TranslatedVerseHeading[];
  paragraphs?: TranslatedVerseParagraphMarker[];
}

export interface TranslatedVerseResponse {
  id: number;
  projectUnitId: number;
  bibleTextId: number;
  assignedUserId: number | null;
  content: string;
  markers: TranslatedVerseMarkers | null;
  verseNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface GetTranslatedVersesParams {
  projectUnitId: number;
  bookId: number;
  chapterNumber: number;
}
