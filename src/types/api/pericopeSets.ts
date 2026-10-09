/**
 * GET /pericope-sets/{id} response shapes (fluent-api pericopes domain).
 * Groups use the public pericope identity (`section_number` for FCBH).
 */

export interface ApiPericopeVerseRef {
  chapterNumber: number;
  verseNumber: number;
}

export interface ApiPericopeSetGroup {
  bookCode: string;
  pericopeNumber: string;
  pericopeTitle: string | null;
  verses: ApiPericopeVerseRef[];
}

export type ApiPericopeSetPayload = ApiPericopeSetGroup[];

export type GetPericopeSetOptions = {
  bookCode?: string;
  /** Prior ETag for If-None-Match revalidation. */
  etag?: string | null;
};
