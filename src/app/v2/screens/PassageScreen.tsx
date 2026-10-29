import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { usePassage } from '../../../hooks/usePassage';
import { hrefs } from '../../../navigation/hrefs';
import {
  parseOptionalString,
  parseRequiredNumber,
  parseRequiredString,
} from '../../../navigation/routeParams';
import { useThemedStyles } from '../../../theme/useTheme';
import { parseUserId } from '../../../utils/parseUserId';
import { Sheet } from './passage/Sheet';

/**
 * Next passage page: a dark hero with the script, Listen and Record, and the
 * takes, which grows into the full player; then the listening materials as
 * Figma's passage rows. The title opens a sheet linking up to the book page.
 * Until the player is wired, its keys open Legacy drafting at this passage.
 */
export default function PassageScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{
    chapterId?: string;
    anchorVerse?: string;
    projectId?: string;
    projectUnitId?: string;
    chapterName?: string;
    projectName?: string;
    milestoneName?: string;
    language?: string;
    from?: string;
  }>();
  const chapterId = parseRequiredNumber(raw.chapterId, 'chapterId');
  const anchorVerse = parseRequiredNumber(raw.anchorVerse, 'anchorVerse');
  const projectId = parseRequiredNumber(raw.projectId, 'projectId');
  const projectUnitId = parseRequiredNumber(raw.projectUnitId, 'projectUnitId');
  const chapterName = parseRequiredString(raw.chapterName, 'chapterName');
  const projectName = parseRequiredString(raw.projectName, 'projectName');
  const milestoneName = parseRequiredString(raw.milestoneName, 'milestoneName');
  const language = parseRequiredString(raw.language, 'language');
  const fromBook = parseOptionalString(raw.from) === 'book';
  const userId = parseUserId();
  const { passage, download, downloadState, reload } = usePassage(
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
    (verse = anchorVerse) =>
      router.push(
        hrefs.verseDetail({
          chapterId,
          chapterName,
          projectName,
          language,
          recoverVerse: verse,
        }),
      ),
    [router, chapterId, chapterName, projectName, language, anchorVerse],
  );
  // From the book page, its copy is already underneath; don't stack another.
  const openBook = useCallback(() => {
    if (fromBook) {
      router.back();
      return;
    }
    router.push(
      hrefs.chapters({
        projectId,
        projectUnitId,
        projectName,
        milestoneName,
        language,
        focusChapterId: chapterId,
      }),
    );
  }, [
    router,
    fromBook,
    projectId,
    projectUnitId,
    projectName,
    milestoneName,
    language,
    chapterId,
  ]);

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
        <Text style={styles.message}>This couldn't be found.</Text>
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <Sheet
        passage={passage}
        userId={userId}
        onReload={reload}
        chapterName={chapterName}
        milestoneName={milestoneName}
        onBack={() => router.back()}
        onOpenBook={openBook}
        onOpenDrafting={openDrafting}
        onDownload={download}
        downloadState={downloadState}
      />
    </View>
  );
}
