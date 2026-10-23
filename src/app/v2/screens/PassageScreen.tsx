import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { usePassage } from '../../../hooks/usePassage';
import { hrefs } from '../../../navigation/hrefs';
import {
  parseRequiredNumber,
  parseRequiredString,
} from '../../../navigation/routeParams';
import { useThemedStyles } from '../../../theme/useTheme';
import { Sheet } from './passage/Sheet';

/**
 * Next passage page: a dark hero with the script, Listen and Record, and the
 * takes, which grows into the full player; then the listening materials as
 * Figma's passage rows. Until the player is wired, its keys open Legacy
 * drafting at this passage.
 */
export default function PassageScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{
    chapterId?: string;
    anchorVerse?: string;
    projectUnitId?: string;
    chapterName?: string;
    projectName?: string;
    language?: string;
  }>();
  const chapterId = parseRequiredNumber(raw.chapterId, 'chapterId');
  const anchorVerse = parseRequiredNumber(raw.anchorVerse, 'anchorVerse');
  const projectUnitId = parseRequiredNumber(raw.projectUnitId, 'projectUnitId');
  const chapterName = parseRequiredString(raw.chapterName, 'chapterName');
  const projectName = parseRequiredString(raw.projectName, 'projectName');
  const language = parseRequiredString(raw.language, 'language');
  const { passage, download, downloadState } = usePassage(
    chapterId,
    anchorVerse,
    projectUnitId,
  );
  const styles = useThemedStyles(t => ({
    screen: { flex: 1, backgroundColor: t.roles.bgDefault },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    message: { ...t.type.body, color: t.roles.fgPrimary },
  }));

  const openDrafting = useCallback(
    () =>
      router.push(
        hrefs.verseDetail({
          chapterId,
          chapterName,
          projectName,
          language,
          recoverVerse: anchorVerse,
        }),
      ),
    [router, chapterId, chapterName, projectName, language, anchorVerse],
  );

  if (passage.status === 'loading') {
    return (
      <View style={styles.screen}>
        <LoadingSpinner />
      </View>
    );
  }
  if (passage.status === 'missing') {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.message}>This passage couldn't be found.</Text>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Sheet
        passage={passage}
        onBack={() => router.back()}
        onOpenDrafting={openDrafting}
        onDownload={download}
        downloadState={downloadState}
      />
    </View>
  );
}
