import { getChapterAssignmentById, getChapterRouteNames } from '../db/queries';
import type { PausedTakeMarker } from '../services/pausedTakes';
import { hrefs } from './hrefs';

/**
 * Where Resume opens an interrupted take. The passage carries the saved
 * session: the key, the verse it was paused on and the capture's unit. The
 * passage page records under those, not under today's drafting unit or where
 * the passage now starts, so nothing here reads pericopes or the setting
 * (#914). `missing` is a marker or chapter that is gone. `unread` is a names
 * read that failed, which is not the same as the chapter being gone: Resume
 * can try again and still open this session. `stale` means the account
 * changed while the read was in flight, so the result must not be opened.
 */
export type RecoveryResolution =
  | { status: 'open'; href: ReturnType<typeof hrefs.passage> }
  | { status: 'missing' }
  | { status: 'unread' }
  | { status: 'stale' };

export async function resolveRecoveryHref(
  marker: Pick<
    PausedTakeMarker,
    'chapterAssignmentId' | 'verseNumber' | 'sessionKey'
  >,
  isCurrent: () => boolean = () => true,
): Promise<RecoveryResolution> {
  if (!isCurrent()) return { status: 'stale' };
  const { chapterAssignmentId, verseNumber, sessionKey } = marker;
  if (
    typeof chapterAssignmentId !== 'number' ||
    !Number.isInteger(chapterAssignmentId) ||
    chapterAssignmentId <= 0 ||
    typeof verseNumber !== 'number' ||
    !Number.isInteger(verseNumber) ||
    verseNumber <= 0 ||
    typeof sessionKey !== 'string' ||
    sessionKey.trim() === ''
  ) {
    return { status: 'missing' };
  }
  const assignment = await getChapterAssignmentById(chapterAssignmentId);
  if (!isCurrent()) return { status: 'stale' };
  if (!assignment) return { status: 'missing' };
  const chapterName = `${assignment.bookName ?? ''} ${
    assignment.chapterNumber
  }`.trim();
  const names = await getChapterRouteNames(chapterAssignmentId);
  if (!isCurrent()) return { status: 'stale' };
  if (!names) return { status: 'unread' };
  return {
    status: 'open',
    href: hrefs.passage({
      chapterId: chapterAssignmentId,
      anchorVerse: verseNumber,
      projectId: assignment.projectId,
      projectUnitId: assignment.projectUnitId,
      chapterName,
      ...names,
      verse: verseNumber,
      recover: { sessionKey, verse: verseNumber },
    }),
  };
}
