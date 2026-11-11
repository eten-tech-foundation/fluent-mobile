import React, { useCallback, useEffect, useRef } from 'react';
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
import { ScreenHeader, useScrolled } from '../../../components/ui/ScreenHeader';
import { SyncStatusButton } from '../../../components/ui/SyncStatusButton';
import { PROJECT_CHAPTERS_EMPTY_MESSAGE } from '../../../constants/messages';
import {
  useBookPassages,
  type BookPassage,
} from '../../../hooks/useBookPassages';
import { useHeaderSync } from '../../../hooks/useHeaderSync';
import { useMilestoneChapters } from '../../../hooks/useMilestoneChapters';
import { resolveAssignmentOpen } from '../../../navigation/chapterOpen';
import { hrefs } from '../../../navigation/hrefs';
import {
  parseOptionalNumber,
  parseRequiredNumber,
  parseRequiredString,
} from '../../../navigation/routeParams';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';
import type { ProjectChapter } from '../../../types/db/types';
import { getWorkflowStageLabel } from '../../../utils/workflowStage';

const OWNERSHIP: Record<ProjectChapter['ownershipState'], string> = {
  mine: 'Yours',
  other: "Someone else's",
  unassigned: 'Unassigned',
};

/**
 * e.g. "Draft · Yours · Upload pending": the stage, whose it is, a take
 * still on the phone or a sync conflict. The covers show what's recorded.
 */
export function chapterMeta(chapter: ProjectChapter): string {
  return [
    chapter.workflowStage ? getWorkflowStageLabel(chapter.workflowStage) : null,
    OWNERSHIP[chapter.ownershipState],
    chapter.hasConflict
      ? 'Sync conflict'
      : chapter.syncState === 'deviceOnly'
      ? 'Upload pending'
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Lets a chapter past the first render window lay out before the retry. */
const SCROLL_RETRY_MS = 100;
/** Each miss measures more rows, so a far chapter can take a few tries. */
const SCROLL_RETRIES = 3;

/**
 * Next book page, in place of Legacy's chapter list: the milestone's
 * passages as a gallery grouped by chapter. A passage opens its passage page.
 * Opens scrolled to `focusChapterId` when given.
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
    focusChapterId?: string;
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
  const focusChapterId = parseOptionalNumber(rawParams.focusChapterId);
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
  const sync = useHeaderSync({ onSyncComplete: reload });
  const scroll = useScrolled();
  const { reset: resetScroll } = scroll;
  const passages = useBookPassages(chapters, projectId, projectUnitId);
  const listRef = useRef<FlatList<ProjectChapter>>(null);
  const focusedRef = useRef(false);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepListRef = useRef(false);
  const lastByChapter = useRef(new Map<number, BookPassage[]>());
  const chaptersReady = chapters.length > 0 && !error && !removedFromProject;
  // Passages settle 'ready' and empty before the chapters arrive; wait until
  // this book's covers are in the map so the first paint is not a bare list.
  const coversReady =
    passages.status === 'ready' &&
    chapters.every(c => passages.byChapter.has(c.id));
  if (passages.status === 'ready') {
    lastByChapter.current = passages.byChapter;
  }
  if (!chaptersReady) {
    keepListRef.current = false;
    lastByChapter.current = new Map();
  } else if (coversReady) {
    keepListRef.current = true;
  }
  // Stay mounted after the first complete paint so returning from a passage
  // keeps the scroll position; do not paint the list until that first paint.
  const listShown = chaptersReady && (coversReady || keepListRef.current);
  useEffect(() => {
    if (!listShown) resetScroll();
  }, [listShown, resetScroll]);
  const focusIndex =
    focusChapterId === undefined
      ? -1
      : chapters.findIndex(c => c.id === focusChapterId);
  // Passages settle 'ready' and empty before the chapters arrive, so wait for
  // this chapter's own covers; scrolling earlier uses rows without them.
  const focusReady =
    passages.status === 'ready' &&
    focusChapterId !== undefined &&
    passages.byChapter.has(focusChapterId);

  // Once; a later reload or focus refresh must not scroll the list back. The
  // first chapter stays put so the milestone header above it shows.
  useEffect(() => {
    if (focusedRef.current || focusIndex < 1 || !focusReady) return;
    focusedRef.current = true;
    listRef.current?.scrollToIndex({
      index: focusIndex,
      viewPosition: 0,
      animated: false,
    });
  }, [focusIndex, focusReady]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const scrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      if (retriesRef.current >= SCROLL_RETRIES) return;
      retriesRef.current += 1;
      retryTimerRef.current = setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: info.index,
          viewPosition: 0,
          animated: false,
        });
      }, SCROLL_RETRY_MS);
    },
    [],
  );

  const styles = useThemedStyles(t => ({
    screen: { flex: 1, backgroundColor: t.roles.bgDefault },
    hero: {
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.sm,
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
    passages.status === 'ready' ? passages.byChapter : lastByChapter.current;
  // A passage that crosses chapters shows under both; count it once. Pericope
  // numbers restart in each book, so the key alone isn't unique.
  const all = Array.from(
    new Map(
      chapters.flatMap(c =>
        (byChapter.get(c.id) ?? []).map(
          p => [`${c.bookName}:${p.key}`, p] as const,
        ),
      ),
    ).values(),
  );
  const recordedCount = all.filter(p => p.recordedStatus === 'recorded').length;

  const tapRef = useRef(0);
  // An observer only ever gets the read-only view.
  const openPassage = useCallback(
    async (chapter: ProjectChapter, passage: BookPassage) => {
      const tap = ++tapRef.current;
      const isCurrent = () => tap === tapRef.current;
      const open = await resolveAssignmentOpen(chapter.id, isCurrent);
      if (open === null || !isCurrent()) return;
      if (open.kind === 'observer') {
        router.push(open.href);
        return;
      }
      router.push(
        hrefs.passage({
          chapterId: chapter.id,
          anchorVerse: passage.anchorVerse,
          projectId,
          projectUnitId,
          chapterName: chapter.displayLabel,
          projectName,
          milestoneName,
          language,
          from: 'book',
        }),
      );
    },
    [router, projectId, projectUnitId, projectName, milestoneName, language],
  );

  const renderChapter: ListRenderItem<ProjectChapter> = ({ item }) => {
    const list: BookPassage[] = byChapter.get(item.id) ?? [];
    const meta = chapterMeta(item);
    return (
      <View style={styles.section} testID={`book-chapter-${item.id}`}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {singleBook ? `Chapter ${item.chapterNumber}` : item.displayLabel}
          </Text>
          {meta ? (
            <Text style={styles.meta} testID={`book-chapter-${item.id}-meta`}>
              {meta}
            </Text>
          ) : null}
        </View>
        <View style={styles.grid}>
          {list.map(passage => (
            <PassageCover
              key={passage.key}
              eyebrow={item.displayLabel}
              verses={passage.verses}
              title={passage.title ?? undefined}
              reference={passage.reference}
              seed={passage.seed}
              groupSeed={passage.groupSeed}
              recordedVerses={passage.recordedVerses}
              totalVerses={passage.totalVerses}
              submitted={passage.submitted}
              peerChecked={passage.peerChecked}
              waitingToSend={passage.waitingToSend}
              onPress={() => void openPassage(item, passage)}
              style={styles.cover}
              testID={`book-passage-${item.id}-${passage.key}`}
            />
          ))}
        </View>
      </View>
    );
  };

  // Soft on the light page, like the passage page's Flat one on the dark hero.
  const header = (
    <ScreenHeader scrolled={listShown && scroll.scrolled} testID="book-header">
      <RoundButton
        icon={ArrowLeft}
        accessibilityLabel="Back"
        onPress={() => router.back()}
        testID="book-back"
      />
      <SyncStatusButton
        status={sync.status}
        failedErrorText={sync.failedErrorText}
        onPress={sync.openSync}
        testID="book-sync"
      />
    </ScreenHeader>
  );

  let body: React.ReactNode;
  if (loading && chapters.length === 0) {
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
  } else if (!listShown) {
    body = <LoadingSpinner />;
  } else {
    body = (
      <FlatList
        ref={listRef}
        data={chapters}
        onScrollToIndexFailed={scrollToIndexFailed}
        onScroll={scroll.onScroll}
        testID="book-list"
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
                {recordedCount} of {all.length}{' '}
                {passages.pericopes ? 'pericopes' : 'chapters'} recorded
              </Text>
            ) : null}
          </View>
        }
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {header}
      {body}
    </View>
  );
}
