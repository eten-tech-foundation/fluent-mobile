import {
  RECORD_SOURCE_TEXT_SYNCING,
  RECORD_SOURCE_TEXT_UNAVAILABLE,
} from '../constants/messages';

/**
 * Record-tab hint when local verse text (`bibleTextId`) is missing (#448).
 * Distinguish sync-in-flight from settled sync with no text.
 */
export function recordSourceTextHint(
  bibleTextId: number | null,
  isSyncing: boolean,
): string | null {
  if (bibleTextId !== null) return null;
  if (isSyncing) return RECORD_SOURCE_TEXT_SYNCING;
  return RECORD_SOURCE_TEXT_UNAVAILABLE;
}
