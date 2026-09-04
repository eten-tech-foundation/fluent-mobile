import fcbhRaw from '../../assets/pericope-sets/FCBH-All-Books.json';
import fiaRaw from '../../assets/pericope-sets/FIA-All-Books.json';
import { BOOK_CODE_TO_NAME } from '../../assets/pericope-sets/bookCodeMap';
import {
  BUNDLED_PERICOPE_VERSIONS,
  FCBH_SET_ID,
  FIA_SET_ID,
} from '../../assets/pericope-sets/pericopeSetVersions';
import type {
  BundledPericopeVerse,
  RawFcbhPericopeRow,
  RawFiaPericopeRow,
} from '../types/pericopeSets/types';

/**
 * Lazy per-book index, built once per set on first access. Avoids
 * re-scanning the full ~16k-row array on every (setId, bookCode) call
 * during sync, which iterates one book at a time.
 */
let fcbhIndex: Map<string, RawFcbhPericopeRow[]> | null = null;
let fiaIndex: Map<string, RawFiaPericopeRow[]> | null = null;

function buildIndex<T extends { book: string }>(rows: T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const existing = index.get(row.book);
    if (existing) {
      existing.push(row);
    } else {
      index.set(row.book, [row]);
    }
  }
  return index;
}

function normalizeFcbhRow(row: RawFcbhPericopeRow): BundledPericopeVerse {
  return {
    chapterNumber: row.chapter,
    verseNumber: row.verse,
    // FCBH splits pericope identity across two fields and has no title;
    // collapse to a single string so both sources share one shape.
    pericopeNumber: `${row.fcbh_section}.${row.fcbh_pericope_number}`,
    pericopeTitle: null,
  };
}

function normalizeFiaRow(row: RawFiaPericopeRow): BundledPericopeVerse {
  return {
    chapterNumber: row.chapter,
    verseNumber: row.verse,
    pericopeNumber: row.fia_pericope_number,
    pericopeTitle: row.fia_pericope_title,
  };
}

/**
 * Loads bundled pericope verses for a (pericopeSetId, bookCode) pair from
 * the APK-bundled FCBH-All-Books.json / FIA-All-Books.json (#447). Pure
 * and synchronous -- no HTTP, no SQLite access. Returns null when the
 * set isn't bundled or the book isn't present in that set's export, so
 * callers (sync.ts, per #438) can fall through to the network path
 * (fluent-api#309) once that exists.
 *
 * Filters + normalizes at call time rather than at build time, so the
 * bundled assets stay an unmodified copy of the source exports (matches
 * fluent-api's data/ files exactly -- easier to diff/refresh).
 */
export function loadBundledPericopeSet(
  pericopeSetId: number,
  bookCode: string,
): BundledPericopeVerse[] | null {
  const bookName = BOOK_CODE_TO_NAME[bookCode];
  if (!bookName) return null;

  if (pericopeSetId === FCBH_SET_ID) {
    fcbhIndex ??= buildIndex(fcbhRaw as RawFcbhPericopeRow[]);
    const rows = fcbhIndex.get(bookName);
    if (!rows || rows.length === 0) return null;
    return rows.map(normalizeFcbhRow).sort(sortByChapterVerse);
  }

  if (pericopeSetId === FIA_SET_ID) {
    fiaIndex ??= buildIndex(fiaRaw as RawFiaPericopeRow[]);
    const rows = fiaIndex.get(bookName);
    if (!rows || rows.length === 0) return null;
    return rows.map(normalizeFiaRow).sort(sortByChapterVerse);
  }

  return null;
}
export function getBundledPericopeSetVersion(
  pericopeSetId: number,
): string | null {
  return BUNDLED_PERICOPE_VERSIONS[pericopeSetId] ?? null;
}

function sortByChapterVerse(
  a: BundledPericopeVerse,
  b: BundledPericopeVerse,
): number {
  if (a.chapterNumber !== b.chapterNumber) {
    return a.chapterNumber - b.chapterNumber;
  }
  return a.verseNumber - b.verseNumber;
}
