/**
 * Hardcoded version markers for the bundled pericope set assets (#447).
 *
 * Bump the relevant entry whenever FCBH-All-Books.pericope /
 * FIA-All-Books.pericope is refreshed from fluent-api's data/ directory -- see
 * docs/guides/pericope-set-bundling.md for the full refresh checklist.
 *
 * #438's sync step compares this against the version already stored
 * locally (pericope_sets.version, or similar) to decide whether a
 * bundled set needs to be reseeded.
 */

/** Must match fluent-api's pericope_sets table ids. */
export const FCBH_SET_ID = 1;
export const FIA_SET_ID = 2;

export const BUNDLED_PERICOPE_VERSIONS: Record<number, string> = {
  [FCBH_SET_ID]: '2026-09-04',
  [FIA_SET_ID]: '2026-09-04',
};

/**
 * Book codes present in both bundled exports. Sync skips the asset read
 * for any other code and goes straight to the API (#1003). Update this
 * when a refresh adds or removes books; the pericopeSets test fails if
 * it drifts from the files.
 */
export const BUNDLED_PERICOPE_BOOK_CODES: ReadonlySet<string> = new Set([
  '1CO',
  '1JN',
  '1KI',
  '1PE',
  '1SA',
  '1TH',
  '1TI',
  '2CO',
  '2JN',
  '2KI',
  '2SA',
  '2TI',
  '3JN',
  'ACT',
  'DEU',
  'EPH',
  'EST',
  'EXO',
  'GAL',
  'GEN',
  'JAS',
  'JDG',
  'JHN',
  'JOS',
  'JUD',
  'LEV',
  'LUK',
  'MAT',
  'MRK',
  'NUM',
  'PHM',
  'PHP',
  'RUT',
  'TIT',
]);
