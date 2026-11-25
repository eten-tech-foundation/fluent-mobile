import type { DraftingUnit } from '../services/draftingUnitPreference';
import { isPausedTakeForeign } from '../services/pausedTakeOwner';
import { listPausedTakes } from '../services/pausedTakes';

export type PassageRecovery = {
  /** The verse the take is keyed on; the recorder records under it. */
  verse: number;
  /** The unit the page records in, whatever the drafting setting says. */
  unit: DraftingUnit;
};

/**
 * The paused take a passage route was opened to pick back up, read from its
 * marker. Null when the marker is gone (finished or discarded since), isn't
 * this chapter and verse, or is another account's; the page then opens as
 * usual. A marker from before captures has no saved unit, so it comes back
 * verse by verse on the verse it was keyed on: its audio is never spread over
 * a passage it can't be shown to cover.
 */
export function readPassageRecovery(
  params: { chapterId: number; sessionKey?: string; verse?: number },
  userId: number | null,
): PassageRecovery | null {
  const { chapterId, sessionKey, verse } = params;
  if (sessionKey === undefined || verse === undefined) return null;
  const marker = listPausedTakes().find(m => m.sessionKey === sessionKey);
  if (
    !marker ||
    marker.chapterAssignmentId !== chapterId ||
    marker.verseNumber !== verse ||
    isPausedTakeForeign(marker, userId)
  ) {
    return null;
  }
  return { verse, unit: marker.capture?.granularity ?? 'verse' };
}
