import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { getVerseDetailNavByChapterAssignment } from '../../../db/queries';
import {
  clearPausedTake,
  findPausedTake,
  type PausedTakeMarker,
} from '../../../services/storage';
import { deleteRecordingFile } from '../../../services/recordingStorage';
import { setLastActiveTab } from '../../../utils/draftingTabState';
import { DraftingTab } from '../../../types/drafting/types';
import { RootStackParamList } from '../../../types/navigation/types';
import { logger } from '../../../utils/logger';

const log = logger.create('useRecordingRecovery');

type Nav = StackNavigationProp<RootStackParamList>;

/**
 * Unlinks a paused take's partial segment files and clears its marker. Used
 * when the user discards a recording recovered after a process kill.
 */
export function discardPausedTake(marker: PausedTakeMarker): void {
  marker.segments.forEach(fileUri => deleteRecordingFile(fileUri));
  clearPausedTake(marker.bibleTextId);
  log.info('Discarded recovered take', { bibleTextId: marker.bibleTextId });
}

/**
 * On the home screen, surface a recording recovered after a process kill and
 * force a decision: Continue (navigate to that verse's Record tab, where the
 * paused take rehydrates and Resume/Stop takes over) or Discard (delete the
 * partial segments). Runs once per mount, only once `enabled` (i.e. sync
 * loading has cleared and the tabs are visible).
 */
export function useRecordingRecovery(enabled: boolean): void {
  const navigation = useNavigation<Nav>();
  const promptedRef = useRef(false);

  useEffect(() => {
    if (!enabled || promptedRef.current) return;
    promptedRef.current = true;

    const marker = findPausedTake();
    if (!marker) return;

    async function promptRecovery(take: PausedTakeMarker) {
      const nav =
        take.chapterAssignmentId !== undefined
          ? await getVerseDetailNavByChapterAssignment(take.chapterAssignmentId)
          : null;

      // Without a resolvable verse we can't act on Continue, so don't prompt a
      // dead end — leave the marker to retry on a later launch.
      if (!nav || take.verseNumber === undefined) {
        log.warn('Skipping recovery prompt; take could not be resolved', {
          bibleTextId: take.bibleTextId,
        });
        return;
      }

      Alert.alert(
        'Resume recording?',
        `You have an unfinished recording for ${nav.chapterName}:${take.verseNumber}. Continue where you left off, or discard it?`,
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => discardPausedTake(take),
          },
          {
            text: 'Continue',
            onPress: () => {
              setLastActiveTab(nav.chapterId, DraftingTab.Record);
              navigation.navigate('VerseDetail', {
                chapterId: nav.chapterId,
                chapterName: nav.chapterName,
                projectName: nav.projectName,
                language: nav.language,
                recoverVerse: take.verseNumber,
              });
            },
          },
        ],
        { cancelable: false },
      );
    }

    promptRecovery(marker).catch(error =>
      log.error('Failed to prompt recording recovery', {
        bibleTextId: marker.bibleTextId,
        error,
      }),
    );
  }, [enabled, navigation]);
}
