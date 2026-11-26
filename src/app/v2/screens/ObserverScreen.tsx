import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, PauseFill, PlayFill } from '../../../components/ui/icons';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { scrubPositionMs } from '../../../components/ui/PlaybackProgressBar';
import { RoundButton } from '../../../components/ui/RoundButton';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { SyncStatusButton } from '../../../components/ui/SyncStatusButton';
import { PERICOPE_UNAVAILABLE_WARNING } from '../../../constants/messages';
import { useBibleTabUnits } from '../../../hooks/useBibleTabUnits';
import { useHeaderSync } from '../../../hooks/useHeaderSync';
import {
  canonicalAudioAvailability,
  type ObserverCanonicalAudioAvailability,
  useObserverCanonicalPlayback,
} from '../../../hooks/useObserverCanonicalPlayback';
import {
  type ObserverDraftChapterState,
  useObserverDraftChapter,
} from '../../../hooks/useObserverDraftChapter';
import { getObserverDraftDestination } from '../../../navigation/observerDraft';
import { parseOptionalNumber } from '../../../navigation/routeParams';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';
import type {
  ObserverDraftUnit,
  ObserverUnresolvedConflictPlaybackPolicy,
} from '../../../types/draftDownload/types';
import type { ChapterAssignmentData, VerseData } from '../../../types/db/types';

type Pane = 'source' | 'draft';

/**
 * Product has not settled allow/block for unresolved conflict audio, so
 * conflict and unknown-status audio stays unavailable; only clean/resolved
 * canonical takes play.
 */
const CONFLICT_PLAYBACK_POLICY: ObserverUnresolvedConflictPlaybackPolicy =
  'undecided';

const NO_UNITS: ObserverDraftUnit[] = [];
const SEEK_STEP_MS = 5000;

const AUDIO_UNAVAILABLE: Record<
  Exclude<ObserverCanonicalAudioAvailability, 'playable'>,
  string
> = {
  unknownStatus: 'Audio unavailable',
  conflictUndecided: 'Audio unavailable',
  // Shown only if CONFLICT_PLAYBACK_POLICY becomes 'block'.
  conflictBlocked: 'Audio unavailable: this verse has a sync conflict',
  noTake: 'No draft recording',
  notDownloaded: 'Audio not downloaded',
};

/** What the Draft pane says above (or instead of) its verses, if anything. */
export function draftNotice(
  status: ObserverDraftChapterState['bundleStatus'],
  unitCount: number,
): string | null {
  if (status === 'queued' || status === 'downloading') {
    return unitCount === 0
      ? "This chapter's draft is downloading."
      : "Some of this chapter's draft is still downloading.";
  }
  if (status === 'failed') {
    return unitCount === 0
      ? "This chapter's draft didn't download."
      : "Some of this chapter's draft didn't download.";
  }
  if (unitCount === 0) {
    return status === 'ready'
      ? 'No draft for this chapter yet.'
      : "This chapter's draft isn't on this phone yet.";
  }
  return null;
}

function hasText(text: string | null): text is string {
  return text !== null && text.trim().length > 0;
}

/**
 * Next read-only Observer chapter: the source text and the canonical draft,
 * with the canonical take's audio. No Record, take choice or stage action.
 * Access (registered active account, exact Project Observer grant, chapter
 * project match) comes from `useObserverDraftChapter`; a chapter tap
 * re-checks it before navigating.
 */
export default function ObserverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const raw = useLocalSearchParams<{
    chapterAssignmentId?: string;
    projectId?: string;
  }>();
  const chapterAssignmentId =
    parseOptionalNumber(raw.chapterAssignmentId) ?? null;
  const projectId = parseOptionalNumber(raw.projectId) ?? null;

  const [pane, setPane] = useState<Pane>('source');
  const chapter = useObserverDraftChapter({ chapterAssignmentId, projectId });
  const { refresh } = chapter;
  const sync = useHeaderSync();

  // Coming back re-runs the access check, and nothing shows until it settles.
  const focusedRef = useRef(focused);
  const returning = focused && !focusedRef.current;
  const [recheck, setRecheck] = useState(false);
  const recheckLoadingRef = useRef(false);
  useEffect(() => {
    if (focused && !focusedRef.current) {
      recheckLoadingRef.current = false;
      setRecheck(true);
      refresh();
    }
    focusedRef.current = focused;
  }, [focused, refresh]);
  // A reload with a live grant always passes through loading; a lost grant
  // settles straight to no access, which has nothing left to protect.
  useEffect(() => {
    if (!recheck) return;
    if (chapter.loading) {
      recheckLoadingRef.current = true;
    } else if (recheckLoadingRef.current || !chapter.hasAccess) {
      setRecheck(false);
    }
  }, [recheck, chapter.loading, chapter.hasAccess]);

  const assignment = chapter.assignment;
  const showContent =
    focused &&
    !returning &&
    !recheck &&
    chapter.hasAccess &&
    assignment !== null;
  const playback = useObserverCanonicalPlayback({
    units: showContent ? chapter.draftUnits : NO_UNITS,
    chapterAssignmentId: assignment?.id ?? chapterAssignmentId ?? 'none',
    accountId: chapter.accountId,
    hasAccess: showContent,
    isActive: showContent && pane === 'draft',
    unresolvedConflictPlaybackPolicy: CONFLICT_PLAYBACK_POLICY,
  });

  const tapRef = useRef(0);
  const openChapter = useCallback(
    async (nextChapterAssignmentId: number) => {
      if (projectId === null || nextChapterAssignmentId === assignment?.id) {
        return;
      }
      const tap = ++tapRef.current;
      const href = await getObserverDraftDestination({
        chapterAssignmentId: nextChapterAssignmentId,
        projectId,
      });
      if (href === null || tap !== tapRef.current || !focusedRef.current) {
        return;
      }
      router.replace(href);
    },
    [assignment?.id, projectId, router],
  );

  const theme = useTheme();
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
    chips: {
      paddingHorizontal: t.spacing.xl,
      paddingBottom: t.spacing.md,
      gap: t.spacing.sm,
    },
    chip: {
      minWidth: t.controlSizes.icon32 + t.spacing.lg,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.surfaceSunken,
      alignItems: 'center',
    },
    chipSelected: { backgroundColor: t.roles.surfaceInverse },
    chipText: { ...t.type.label, color: t.roles.fgPrimary },
    chipTextSelected: { color: t.roles.fgOnInverse },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: t.spacing.xl,
      marginBottom: t.spacing.md,
      padding: t.spacing.xxs,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.surfaceSunken,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: t.spacing.sm,
      borderRadius: t.radius.full,
    },
    tabSelected: { backgroundColor: t.roles.surfaceHighlight },
    tabText: { ...t.type.label, color: t.roles.fgSecondary },
    tabTextSelected: { color: t.roles.fgPrimary },
    list: { flex: 1 },
    listContent: {
      paddingHorizontal: t.spacing.xl,
      gap: t.spacing.lg,
    },
    verse: { gap: t.spacing.xs },
    verseNumber: { ...t.type.label, color: t.roles.fgSecondary },
    verseText: { ...t.type.body, color: t.roles.fgPrimary },
    unavailable: { ...t.type.body, color: t.roles.fgSecondary },
    audio: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
    },
    audioMeta: { ...t.type.meta, color: t.roles.fgSecondary, flex: 1 },
    track: {
      flex: 1,
      height: t.spacing.xxl,
      justifyContent: 'center',
    },
    trackRail: {
      height: t.spacing.xs,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.surfaceSunken,
      overflow: 'hidden',
    },
    trackFill: {
      height: '100%',
      backgroundColor: t.roles.accentPrimary,
    },
    notice: {
      ...t.type.body,
      color: t.roles.fgSecondary,
      paddingVertical: t.spacing.sm,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
    },
    message: {
      ...t.type.body,
      color: t.roles.fgPrimary,
      textAlign: 'center',
    },
  }));

  const header = (
    <ScreenHeader scrolled={false} testID="observer-header">
      <RoundButton
        icon={ArrowLeft}
        accessibilityLabel="Back"
        onPress={() => router.back()}
        testID="observer-back"
      />
      <SyncStatusButton
        status={sync.status}
        failedErrorText={sync.failedErrorText}
        onPress={sync.openSync}
        testID="observer-sync"
      />
    </ScreenHeader>
  );

  if (!showContent) {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top }]}
        testID="observer-screen"
      >
        {header}
        {chapter.loading || returning || recheck ? (
          <View style={styles.centered} testID="observer-loading">
            <LoadingSpinner />
          </View>
        ) : focused ? (
          <View style={styles.centered} testID="observer-no-access">
            <Text style={styles.message}>
              This Observer chapter is unavailable for the active account.
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  const bookName = assignment.bookName ?? 'Chapter';
  const title = `${bookName} ${assignment.chapterNumber}`;
  const reference = (verse: number) =>
    `${bookName} ${assignment.chapterNumber}:${verse}`;
  const notice = draftNotice(chapter.bundleStatus, chapter.draftUnits.length);

  const renderDraft = ({ item }: { item: ObserverDraftUnit }) => {
    const availability = canonicalAudioAvailability(
      item,
      CONFLICT_PLAYBACK_POLICY,
    );
    const isLive =
      playback.playingBibleTextId === item.bibleTextId ||
      playback.loadedBibleTextId === item.bibleTextId;
    const isPlaying =
      playback.playingBibleTextId === item.bibleTextId &&
      playback.status === 'playing';
    const label = `canonical draft, ${reference(item.verseNumber)}`;
    return (
      <View style={styles.verse} testID={`observer-draft-${item.bibleTextId}`}>
        <Text style={styles.verseNumber}>{`Verse ${item.verseNumber}`}</Text>
        {hasText(item.draftText) ? (
          <Text
            style={styles.verseText}
            testID={`observer-draft-text-${item.bibleTextId}`}
          >
            {item.draftText}
          </Text>
        ) : (
          <Text
            style={styles.unavailable}
            testID={`observer-draft-text-unavailable-${item.bibleTextId}`}
          >
            Draft text unavailable
          </Text>
        )}
        {availability === 'playable' ? (
          <View style={styles.audio}>
            <RoundButton
              icon={isPlaying ? PauseFill : PlayFill}
              accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} ${label}`}
              onPress={() => void playback.playPause(item)}
              testID={`observer-draft-play-${item.bibleTextId}`}
            />
            {isLive ? (
              <SeekTrack
                positionMs={playback.positionMs}
                durationMs={playback.durationMs}
                label={label}
                onSeek={ms => playback.seekUnit(item, ms)}
                styles={styles}
                testID={`observer-draft-seek-${item.bibleTextId}`}
              />
            ) : (
              <Text style={styles.audioMeta}>
                {`Canonical draft · ${reference(item.verseNumber)}`}
              </Text>
            )}
          </View>
        ) : (
          <Text
            style={styles.audioMeta}
            testID={`observer-draft-audio-unavailable-${item.bibleTextId}`}
          >
            {AUDIO_UNAVAILABLE[availability]}
          </Text>
        )}
      </View>
    );
  };

  const contentStyle = [
    styles.listContent,
    { paddingBottom: theme.spacing.xxl + insets.bottom },
  ];

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top }]}
      testID="observer-screen"
    >
      {header}
      <View style={styles.hero}>
        <Text style={styles.name} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.meta}>Observer · Read only</Text>
      </View>
      {chapter.unitChapters.length > 1 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            testID="observer-chapters"
          >
            {chapter.unitChapters.map(item => {
              const selected = item.id === assignment.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => void openChapter(item.id)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${item.book_name} ${item.chapter_number}`}
                  testID={`observer-chapter-${item.id}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {item.chapter_number}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['source', 'draft'] as const).map(value => {
          const selected = pane === value;
          const name = value === 'source' ? 'Source' : 'Draft';
          return (
            <Pressable
              key={value}
              onPress={() => setPane(value)}
              style={[styles.tab, selected && styles.tabSelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={name}
              testID={`observer-tab-${value}`}
            >
              <Text
                style={[styles.tabText, selected && styles.tabTextSelected]}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {pane === 'source' ? (
        <SourcePane
          assignment={assignment}
          verses={chapter.sourceVerses}
          chapterName={title}
          contentStyle={contentStyle}
          styles={styles}
        />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={contentStyle}
          data={chapter.draftUnits}
          keyExtractor={item => String(item.bibleTextId)}
          renderItem={renderDraft}
          extraData={playback}
          testID="observer-draft-list"
          ListHeaderComponent={
            notice ? (
              <Text style={styles.notice} testID="observer-draft-notice">
                {notice}
              </Text>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

type SourcePaneStyles = {
  list: StyleProp<ViewStyle>;
  verse: StyleProp<ViewStyle>;
  verseNumber: StyleProp<TextStyle>;
  verseText: StyleProp<TextStyle>;
  notice: StyleProp<TextStyle>;
};

/**
 * The chapter's source text in the project's drafting units: pericopes with
 * their full range titles (cross-chapter spans included), or verses.
 */
function SourcePane({
  assignment,
  verses,
  chapterName,
  contentStyle,
  styles,
}: {
  assignment: ChapterAssignmentData;
  verses: VerseData[];
  chapterName: string;
  contentStyle: StyleProp<ViewStyle>;
  styles: SourcePaneStyles;
}) {
  const { units, unitsPending, draftingUnit, effectiveUnit } = useBibleTabUnits(
    {
      bibleId: assignment.bibleId,
      bookId: assignment.bookId,
      chapterNumber: assignment.chapterNumber,
      projectId: assignment.projectId,
      projectUnitId: assignment.projectUnitId,
      verses,
      chapterName,
      bookName: assignment.bookName ?? '',
      selectedVerse: verses[0]?.verseNumber ?? 1,
    },
  );

  if (verses.length === 0) {
    return (
      <Text style={styles.notice} testID="observer-source-empty">
        This chapter's source text isn't on this phone yet.
      </Text>
    );
  }
  if (unitsPending) {
    return <LoadingSpinner />;
  }
  const pericopes = effectiveUnit === 'pericope';
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={contentStyle}
      data={units}
      keyExtractor={unit => unit.key}
      testID="observer-source-list"
      ListHeaderComponent={
        draftingUnit === 'pericope' && !pericopes ? (
          <Text style={styles.notice} testID="observer-pericope-unavailable">
            {PERICOPE_UNAVAILABLE_WARNING}
          </Text>
        ) : undefined
      }
      renderItem={({ item }) => (
        <View style={styles.verse} testID={`observer-source-${item.key}`}>
          <Text style={styles.verseNumber} accessibilityRole="header">
            {pericopes ? item.title : `Verse ${item.title}`}
          </Text>
          <Text style={styles.verseText}>
            {pericopes
              ? item.bodyVerses.map((verse, index) => (
                  <Text key={`${verse.chapterNumber}:${verse.verseNumber}`}>
                    {index > 0 ? ' ' : ''}
                    <Text style={styles.verseNumber}>
                      {`${verse.verseNumber} `}
                    </Text>
                    {verse.text}
                  </Text>
                ))
              : item.previewText}
          </Text>
        </View>
      )}
    />
  );
}

type SeekTrackStyles = {
  track: StyleProp<ViewStyle>;
  trackRail: StyleProp<ViewStyle>;
  trackFill: StyleProp<ViewStyle>;
};

/** Tap to seek; TalkBack swipes up/down move five seconds. */
function SeekTrack({
  positionMs,
  durationMs,
  label,
  onSeek,
  styles,
  testID,
}: {
  positionMs: number;
  durationMs: number;
  label: string;
  onSeek: (ms: number) => void;
  styles: SeekTrackStyles;
  testID: string;
}) {
  const [width, setWidth] = useState(0);
  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  const onAction = (event: AccessibilityActionEvent) => {
    const delta =
      event.nativeEvent.actionName === 'increment'
        ? SEEK_STEP_MS
        : -SEEK_STEP_MS;
    onSeek(Math.min(durationMs, Math.max(0, positionMs + delta)));
  };
  return (
    <Pressable
      style={styles.track}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onPress={e =>
        onSeek(scrubPositionMs(e.nativeEvent.locationX, width, durationMs))
      }
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      testID={testID}
    >
      <View style={styles.trackRail}>
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
}
