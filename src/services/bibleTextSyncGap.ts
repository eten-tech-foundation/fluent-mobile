/**
 * Root-cause note for #177 (exported for the unit test / PR docs).
 *
 * Null `bibleTextId` happens when `bible_texts` has no row for the selected
 * verse. Incremental sync (`updatedAfter`) can return empty payloads for
 * newly assigned chapters, so those verses never get inserted. The fix is to
 * full-fetch any assigned chapter that currently has zero local verses.
 */
export const NULL_BIBLE_TEXT_ID_ROOT_CAUSE =
  'incremental bible-text sync skipped newly assigned chapters with zero local verses';
