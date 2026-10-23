import React, { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from '../../../components/ui/icons';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { PassageCover } from '../../../components/ui/PassageCover';
import { RoundButton } from '../../../components/ui/RoundButton';
import { PROJECT_CHAPTERS_EMPTY_MESSAGE } from '../../../constants/messages';
import {
  useBookPassages,
  type BookPassage,
} from '../../../hooks/useBookPassages';
import { useGlobalSyncStatus } from '../../../hooks/useGlobalSyncStatus';
import { useMilestoneChapters } from '../../../hooks/useMilestoneChapters';
import { hrefs } from '../../../navigation/hrefs';
import {
  parseRequiredNumber,
  parseRequiredString,
} from '../../../navigation/routeParams';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';
import type { ProjectChapter } from '../../../types/db/types';

/**
 * Next book page, in place of Legacy's chapter list: the milestone's
 * passages as a gallery grouped by chapter. A passage opens its passage page.
 * The covers are a placeholder until the Claude Design version.
 */
export default function BookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const rawParams = useLocalSearchParams<{
    projectId?: string;
    projectUnitId?: string;
    projectName?: string;
    milestoneName?: string;
    language?: string;
  }>();
  const projectId = parseRequiredNumber(rawParams.projectId, 'projectId');
  const projectUnitId = parseRequiredNumber(
    rawParams.projectUnitId,
    'projectUnitId',
  );
  const projectName = parseRequiredString(rawParams.projectName, 'projectName');
  const milestoneName = parseRequiredString(
    rawParams.milestoneName,
    'milestoneName',
  );
  const language = parseRequiredString(rawParams.language, 'language');
  const {
    chapters,
    loading,
    refreshing,
    error,
    removedFromProject,
    refresh,
    retry,
    reload,
  } = useMilestoneChapters(projectUnitId, projectId);
  useGlobalSyncStatus(reload);
  const passages = useBookPassages(chapters, projectId, projectUnitId);

  const styles = useThemedStyles(t => ({
    screen: { flex: 1, backgroundColor: t.roles.bgDefault },
    back: { marginLeft: t.spacing.xl, marginTop: t.spacing.sm },
    hero: {
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.md,
      gap: t.spacing.xs,
    },
    name: { ...t.type.heading, color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    section: { paddingTop: t.spacing.xxl, gap: t.spacing.md },
    sectionHead: { paddingHorizontal: t.spacing.xl, gap: t.spacing.xxs },
    sectionTitle: { ...t.type.title, color: t.roles.fgPrimary },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.xl,
      rowGap: t.spacing.xl,
    },
    cover: { width: '47%' },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
      gap: t.spacing.md,
    },
    message: {
      ...t.type.body,
      color: t.roles.fgPrimary,
      textAlign: 'center',
    },
    retry: { ...t.type.title, color: t.roles.accentPrimary },
  }));

  const books = new Set(chapters.map(c => c.bookName));
  const singleBook = books.size === 1 ? chapters[0]?.bookName : undefined;
  const title = singleBook ?? milestoneName;
  const byChapter =
    passages.status === 'ready' ? passages.byChapter : new Map();
  // A passage that crosses chapters shows under both; count it once.
  const all: BookPassage[] = Array.from(
    new Map(
      Array.from(byChapter.values())
        .flat()
        .map((p: BookPassage) => [p.key, p]),
    ).values(),
  );
  const recordedCount = all.filter(p => p.recordedStatus === 'recorded').length;

  const openPassage = useCallback(
    (chapter: ProjectChapter, passage: BookPassage) =>
      router.push(
        hrefs.passage({
          chapterId: chapter.id,
          anchorVerse: passage.anchorVerse,
          projectUnitId,
          chapterName: chapter.displayLabel,
          projectName,
          language,
        }),
      ),
    [router, projectUnitId, projectName, language],
  );

  const renderChapter: ListRenderItem<ProjectChapter> = ({ item }) => {
    const list: BookPassage[] = byChapter.get(item.id) ?? [];
    const recorded = list.filter(p => p.recordedStatus === 'recorded').length;
    return (
      <View style={styles.section} testID={`book-chapter-${item.id}`}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {singleBook ? `Chapter ${item.chapterNumber}` : item.displayLabel}
          </Text>
          {list.length > 0 ? (
            <Text style={styles.meta}>
              {recorded} of {list.length} recorded
            </Text>
          ) : null}
        </View>
        <View style={styles.grid}>
          {list.map(passage => (
            <PassageCover
              key={passage.key}
              eyebrow={item.displayLabel}
              verses={passage.verses}
              title={passage.title ?? passage.reference}
              reference={passage.reference}
              status={passage.recordedStatus}
              onPress={() => openPassage(item, passage)}
              style={styles.cover}
              testID={`book-passage-${item.id}-${passage.key}`}
            />
          ))}
        </View>
      </View>
    );
  };

  // Soft on the light page, like the passage page's Flat one on the dark hero.
  const backButton = (
    <RoundButton
      icon={ArrowLeft}
      accessibilityLabel="Back"
      onPress={() => router.back()}
      style={styles.back}
      testID="book-back"
    />
  );

  let body: React.ReactNode;
  if (loading) {
    body = <LoadingSpinner />;
  } else if (error || removedFromProject) {
    body = (
      <View style={styles.centered}>
        <Text style={styles.message}>
          {removedFromProject
            ? "You've been unassigned from this project. Go back to see your other work."
            : 'Unable to load this project.'}
        </Text>
        {removedFromProject ? null : (
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            testID="book-retry"
          >
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        )}
      </View>
    );
  } else if (chapters.length === 0) {
    body = (
      <View style={styles.centered}>
        <Text style={styles.message}>{PROJECT_CHAPTERS_EMPTY_MESSAGE}</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={chapters}
        keyExtractor={item => String(item.id)}
        renderItem={renderChapter}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={{
          paddingBottom: theme.spacing.xxl + insets.bottom,
        }}
        ListHeaderComponent={
          <View style={styles.hero}>
            <Text style={styles.name} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.meta}>
              {projectName} · {language}
            </Text>
            {passages.status === 'ready' ? (
              <Text style={styles.meta} testID="book-progress">
                {recordedCount} of {all.length} passages recorded
              </Text>
            ) : null}
          </View>
        }
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {backButton}
      {body}
    </View>
  );
}
