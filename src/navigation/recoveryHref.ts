import {
  getChapterAssignmentById,
  getChapterRouteNames,
  getPericopeForVerse,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import { getDraftingUnit } from '../services/draftingUnitPreference';
import type { PausedTakeMarker } from '../services/pausedTakes';
import { getActiveUserId } from '../services/storage';
import type { UiVersion } from '../theme/uiVersionTypes';
import { hrefs } from './hrefs';
import { passageSessionVerse } from './passageSessionVerse';

/**
 * Where Resume opens an interrupted take. In Next a passage take reopens its
 * passage when the saved verse is the one the player records under, and a
 * verse take reopens its passage on that verse when the player records verse
 * by verse there. Any other take, a marker from before captures were
 * recorded, or any take in Legacy, opens drafting on it, as does any take
 * whose chapter's pericopes can't be read. Null when the marker or its chapter
 * is gone.
 */
export async function resolveRecoveryHref(
  marker: PausedTakeMarker,
  uiVersion: UiVersion,
) {
  const { chapterAssignmentId, verseNumber, sessionKey } = marker;
  if (
    typeof chapterAssignmentId !== 'number' ||
    typeof verseNumber !== 'number'
  ) {
    return null;
  }
  const assignment = await getChapterAssignmentById(chapterAssignmentId);
  if (!assignment) return null;
  const chapterName = `${assignment.bookName ?? ''} ${
    assignment.chapterNumber
  }`.trim();
  const drafting = hrefs.verseDetail({
    chapterId: chapterAssignmentId,
    chapterName,
    projectName: '',
    language: '',
    recoverSessionKey: sessionKey,
    recoverVerse: verseNumber,
  });
  const granularity = marker.capture?.granularity;
  if (
    uiVersion !== 'next' ||
    granularity === undefined ||
    assignment.projectId === null
  ) {
    return drafting;
  }
  const names = await getChapterRouteNames(chapterAssignmentId);
  const verseSetting = getDraftingUnit(getActiveUserId()) === 'verse';
  // Verse by verse never reads pericopes, so there is nothing to fail there.
  const pericopeSetId = verseSetting
    ? null
    : await getProjectPericopeSetId(assignment.projectId);
  const lookup = { failed: false };
  const group =
    pericopeSetId === null
      ? null
      : await getPericopeForVerse(
          assignment.bookId,
          assignment.chapterNumber,
          verseNumber,
          pericopeSetId,
          () => {
            lookup.failed = true;
          },
        );
  // An unreadable lookup isn't "no pericopes": the chapter's shape is unknown,
  // and a later read could open a different session than the paused one (#899).
  if (lookup.failed || !names) return drafting;
  const passage = {
    chapterId: chapterAssignmentId,
    anchorVerse: verseNumber,
    projectId: assignment.projectId,
    projectUnitId: assignment.projectUnitId,
    chapterName,
    ...names,
  };
  // Verse by verse in the setting, or a chapter without pericopes.
  const verseMode = !group || verseSetting;
  if (granularity === 'verse') {
    return verseMode
      ? hrefs.passage({ ...passage, verse: verseNumber })
      : drafting;
  }
  // The player would look a passage take up as a verse take.
  if (verseMode) return drafting;
  const sessionVerse = group
    ? passageSessionVerse(group.verses, assignment.chapterNumber)
    : null;
  // Next looks the take up under the passage's first verse. A take paused on
  // a later verse only comes back in classic drafting.
  return sessionVerse === verseNumber ? hrefs.passage(passage) : drafting;
}