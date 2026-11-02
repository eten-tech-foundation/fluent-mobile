import { getChapterAssignmentById, getChapterRouteNames } from '../db/queries';
import type { PausedTakeMarker } from '../services/pausedTakes';
import type { UiVersion } from '../theme/uiVersionTypes';
import { hrefs } from './hrefs';

/**
 * Where Resume opens an interrupted take. In Next a passage take reopens its
 * passage, which picks the paused take back up; a verse take, a marker from
 * before captures were recorded, or any take in Legacy, opens drafting on it. Null when the marker or its chapter is gone.
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
  if (
    uiVersion === 'next' &&
    marker.capture?.granularity === 'pericope' &&
    assignment.projectId !== null
  ) {
    const names = await getChapterRouteNames(chapterAssignmentId);
    if (names) {
      return hrefs.passage({
        chapterId: chapterAssignmentId,
        anchorVerse: verseNumber,
        projectId: assignment.projectId,
        projectUnitId: assignment.projectUnitId,
        chapterName,
        ...names,
      });
    }
  }
  return hrefs.verseDetail({
    chapterId: chapterAssignmentId,
    chapterName,
    projectName: '',
    language: '',
    recoverSessionKey: sessionKey,
    recoverVerse: verseNumber,
  });
}
