/**
 * Hardcoded version markers for the bundled pericope set assets (#447).
 *
 * Bump the relevant entry whenever FCBH-All-Books.json / FIA-All-Books.json
 * is refreshed from fluent-api's data/ directory -- see
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