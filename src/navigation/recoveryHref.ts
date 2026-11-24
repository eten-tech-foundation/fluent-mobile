import { getChapterAssignmentById, getChapterRouteNames } from '../db/queries';
import type { PausedTakeMarker } from '../services/pausedTakes';
import type { UiVersion } from '../theme/uiVersionTypes';
import { hrefs } from './hrefs';

/**
 * Where Resume opens an interrupted take. Legacy opens drafting on it. Next
 * opens its passage carrying the saved session: the key, the verse it was
 * paused on and the capture's unit. The passage page records under those, not
 * under today's drafting unit or where the passage now starts, so nothing
 * here reads pericopes or the setting (#914). Null when the marker or its
 * chapter is gone, or the chapter's names can't be read: Resume then offers
 * Retry or Discard and the audio stays where it is.
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
  if (uiVersion !== 'next') {
    return hrefs.verseDetail({
      chapterId: chapterAssignmentId,
      chapterName,
      projectName: '',
      language: '',
      recoverSessionKey: sessionKey,
      recoverVerse: verseNumber,
    });
  }
  const names = await getChapterRouteNames(chapterAssignmentId);
  if (!names) return null;
  return hrefs.passage({
    chapterId: chapterAssignmentId,
    anchorVerse: verseNumber,
    projectId: assignment.projectId,
    projectUnitId: assignment.projectUnitId,
    chapterName,
    ...names,
    verse: verseNumber,
    recover: { sessionKey, verse: verseNumber },
  });
}
