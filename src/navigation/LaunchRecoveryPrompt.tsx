import { useRouter } from 'expo-router';
import { getChapterAssignmentById } from '../db/queries';
import { useLaunchRecoveryPrompt } from '../services/useLaunchRecoveryPrompt';
import { logger } from '../utils/logger';
import { hrefs } from './hrefs';

const log = logger.create('LaunchRecoveryPrompt');

/**
 * Offers to resume a paused take once per signed-in launch. Mounted at the
 * root so it runs whether the user lands in Legacy or the v2 tree.
 */
export function LaunchRecoveryPrompt() {
  const router = useRouter();

  useLaunchRecoveryPrompt({
    onResume: async marker => {
      const { chapterAssignmentId, verseNumber, sessionKey } = marker;
      if (
        typeof chapterAssignmentId !== 'number' ||
        typeof verseNumber !== 'number'
      ) {
        return false;
      }
      try {
        const assignment = await getChapterAssignmentById(chapterAssignmentId);
        if (!assignment) return false;
        router.navigate(
          hrefs.verseDetail({
            chapterId: chapterAssignmentId,
            chapterName: `${assignment.bookName ?? ''} ${
              assignment.chapterNumber
            }`.trim(),
            projectName: '',
            language: '',
            recoverSessionKey: sessionKey,
            recoverVerse: verseNumber,
          }),
        );
        return true;
      } catch (error) {
        log.warn('Resume navigation failed', { error });
        return false;
      }
    },
  });

  return null;
}
