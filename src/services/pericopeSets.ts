import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { BOOK_CODE_TO_NAME } from '../../assets/pericope-sets/bookCodeMap';
import {
  BUNDLED_PERICOPE_VERSIONS,
  FCBH_SET_ID,
  FIA_SET_ID,
} from '../../assets/pericope-sets/pericopeSetVersions';
import type { ApiPericopeSetGroup } from '../types/api/pericopeSets';
import type {
  BundledPericopeVerse,
  RawFcbhPericopeRow,
  RawFiaPericopeRow,
} from '../types/pericopeSets/types';

/**
 * Jest's pericope transformer parses these requires as arrays. Metro
 * packages the `.pericope` extension as an asset, so a device require is
 * a numeric asset id and the JSON text stays out of the Hermes bundle
 * (#1003). `.json` cannot be used: Metro always emits that extension as
 * a JavaScript object literal.
 */
type BundledModule<T> = number | readonly T[];

type IndexCache<T extends { book: string }> = {
  index: Promise<Map<string, T[]>> | null;
};

const fcbhCache: IndexCache<RawFcbhPericopeRow> = { index: null };
const fiaCache: IndexCache<RawFiaPericopeRow> = { index: null };

/** Tests only: drop parsed indexes so the next call reads again. */
export function __resetBundledPericopeCacheForTests(): void {
  fcbhCache.index = null;
  fiaCache.index = null;
}

function requireFcbhJson(): BundledModule<RawFcbhPericopeRow> {
  return require('../../assets/pericope-sets/FCBH-All-Books.pericope') as BundledModule<RawFcbhPericopeRow>;
}

function requireFiaJson(): BundledModule<RawFiaPericopeRow> {
  return require('../../assets/pericope-sets/FIA-All-Books.pericope') as BundledModule<RawFiaPericopeRow>;
}

/**
 * Per-book index, built once per set on first access. Avoids re-scanning
 * the full ~16k-row array on every (setId, bookCode) call during sync,
 * which iterates one book at a time.
 */
function buildIndex<T extends { book: string }>(
  rows: readonly T[],
): Map<string, T[]> {
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
    section: row.fcbh_section,
    pericopeNumber: String(row.fcbh_pericope_number),
    pericopeTitle: null,
  };
}

function normalizeFiaRow(row: RawFiaPericopeRow): BundledPericopeVerse {
  return {
    chapterNumber: row.chapter,
    verseNumber: row.verse,
    section: null,
    pericopeNumber: row.fia_pericope_number,
    pericopeTitle: row.fia_pericope_title,
  };
}

type AssetReadTiming = {
  /** JavaScript string length of the asset text. Not a UTF-8 scan. */
  bytes: number;
  parseMs: number;
};

function monotonicNow(): number {
  const perf = (globalThis as { performance?: { now?: () => number } })
    .performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

function elapsedMs(since: number): number {
  return Math.round((monotonicNow() - since) * 10) / 10;
}

/**
 * The dev logger is silent in a release APK. This line is the logcat
 * trace for one bundled pericope read (#1003).
 */
function logAssetTiming(
  setId: number,
  bytes: number,
  parseMs: number,
  indexMs: number,
): void {
  // eslint-disable-next-line no-console
  console.log(
    `[pericope.asset.timing] ${JSON.stringify({
      setId,
      bytes,
      parseMs,
      indexMs,
    })}`,
  );
}

async function readBundledJson<T>(
  source: BundledModule<T>,
): Promise<{ rows: readonly T[]; timing: AssetReadTiming | null }> {
  if (typeof source !== 'number') {
    return { rows: source, timing: null };
  }
  const asset = Asset.fromModule(source);
  const downloaded = asset.localUri ? asset : await asset.downloadAsync();
  const uri = downloaded.localUri;
  if (!uri) {
    throw new Error('Bundled pericope JSON asset has no local URI');
  }
  const text = await FileSystem.readAsStringAsync(uri);
  const parseStarted = monotonicNow();
  const parsed: unknown = JSON.parse(text);
  const parseMs = elapsedMs(parseStarted);
  if (!Array.isArray(parsed)) {
    throw new Error('Bundled pericope JSON is not an array');
  }
  return {
    rows: parsed as T[],
    timing: { bytes: text.length, parseMs },
  };
}

function loadIndex<T extends { book: string }>(
  setId: number,
  cache: IndexCache<T>,
  loadModule: () => BundledModule<T>,
): Promise<Map<string, T[]>> {
  if (cache.index) return cache.index;
  const pending = readBundledJson(loadModule())
    .then(result => {
      const indexStarted = monotonicNow();
      const index = buildIndex(result.rows);
      if (result.timing) {
        logAssetTiming(
          setId,
          result.timing.bytes,
          result.timing.parseMs,
          elapsedMs(indexStarted),
        );
      }
      return index;
    })
    .catch((error: unknown) => {
      if (cache.index === pending) cache.index = null;
      throw error;
    });
  cache.index = pending;
  return pending;
}

/**
 * Loads bundled pericope verses for a (pericopeSetId, bookCode) pair from
 * the APK-bundled FCBH-All-Books.pericope / FIA-All-Books.pericope
 * (#447). The files are assets, read the first time that set is needed (#1003). No
 * HTTP and no SQLite access. Resolves null when the set isn't bundled or
 * the book isn't present in that set's export. Rejects when the asset
 * cannot be read or the file is not a JSON array. `syncPericopes` catches
 * that rejection and falls through to `FluentAPI.getPericopeSet()` (#438 / #587).
 *
 * Filters + normalizes at call time rather than at build time, so the
 * bundled assets stay an unmodified copy of the source exports (matches
 * fluent-api's data/ files exactly -- easier to diff/refresh).
 */
export async function loadBundledPericopeSet(
  pericopeSetId: number,
  bookCode: string,
): Promise<BundledPericopeVerse[] | null> {
  const bookName = BOOK_CODE_TO_NAME[bookCode];
  if (!bookName) return null;

  if (pericopeSetId === FCBH_SET_ID) {
    const index = await loadIndex(FCBH_SET_ID, fcbhCache, requireFcbhJson);
    const rows = index.get(bookName);
    if (!rows || rows.length === 0) return null;
    return rows.map(normalizeFcbhRow).sort(sortByChapterVerse);
  }

  if (pericopeSetId === FIA_SET_ID) {
    const index = await loadIndex(FIA_SET_ID, fiaCache, requireFiaJson);
    const rows = index.get(bookName);
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

/**
 * Split API public identity (`section_number` for FCBH) back into the
 * SQLite `section` + `pericope_number` columns used by bundled seeders.
 */
export function parseApiPericopeIdentity(pericopeNumber: string): {
  section: number | null;
  pericopeNumber: string;
} {
  const match = /^(\d+)_(.+)$/.exec(pericopeNumber);
  if (match) {
    return { section: Number(match[1]), pericopeNumber: match[2] };
  }
  return { section: null, pericopeNumber };
}

/** Flatten GET /pericope-sets/{id} groups into per-verse rows for upsert. */
export function flattenApiPericopeSetGroups(
  groups: ApiPericopeSetGroup[],
): BundledPericopeVerse[] {
  const verses: BundledPericopeVerse[] = [];
  for (const group of groups) {
    const { section, pericopeNumber } = parseApiPericopeIdentity(
      group.pericopeNumber,
    );
    for (const ref of group.verses) {
      verses.push({
        chapterNumber: ref.chapterNumber,
        verseNumber: ref.verseNumber,
        section,
        pericopeNumber,
        pericopeTitle: group.pericopeTitle,
      });
    }
  }
  return verses.sort(sortByChapterVerse);
}
