import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { useDraftingContext } from '../context/DraftingContext';
import { getBibleTextId } from '../../db/queries';
import { useVerseAudio } from '../../hooks/useVerseAudio';
import { requestMicPermission } from '../../audio/micPermission';
import { PlaybackProgressBar } from '../../components/ui/PlaybackProgressBar';
import { RootStackParamList } from '../../types/navigation/types';
import { ChapterAssignmentData } from '../../types/db/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type RecordTabProps = {
  chapterData: ChapterAssignmentData;
};

/**
 * Record tab — draft capture / review for the selected drafting verse.
 * Built on useVerseAudio (#97); kill-safe ADTS multi-segment pause is #176/#170 follow-up.
 */
export function RecordTab({ chapterData }: RecordTabProps) {
  const { chapterName } = useRoute<Route>().params;
  const { verses, selectedVerse, setSelectedVerse } = useDraftingContext();
  const [bibleTextId, setBibleTextId] = useState<number | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const verseAudio = useVerseAudio({ bibleTextId });
  const verseIndex = verses.findIndex(v => v.verseNumber === selectedVerse);
  const prevDisabled = verseIndex <= 0;
  const nextDisabled = verseIndex < 0 || verseIndex >= verses.length - 1;
  const selected = verses.find(v => v.verseNumber === selectedVerse);
  const reference = `${chapterName}:${selectedVerse}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await getBibleTextId(
        chapterData.bibleId,
        chapterData.bookId,
        chapterData.chapterNumber,
        selectedVerse,
      );
      if (!cancelled) setBibleTextId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterData, selectedVerse]);

  useEffect(() => {
    if (verseAudio.state !== 'recording') {
      return;
    }
    const tickStartedAt = Date.now() - elapsedMs;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - tickStartedAt);
    }, 200);
    return () => clearInterval(id);
    // Only re-arm when entering recording — not on every elapsed tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [verseAudio.state]);

  useEffect(() => {
    if (verseAudio.state === 'idle') {
      setElapsedMs(0);
    }
  }, [verseAudio.state]);

  const recordDisabled = bibleTextId === null;
  const syncingMessage =
    bibleTextId === null
      ? 'Source text still syncing for this verse — recording will unlock when ready.'
      : null;

  async function ensureMic(): Promise<boolean> {
    const permission = await requestMicPermission();
    if (permission === 'granted') return true;
    Alert.alert(
      'Microphone required',
      'Allow microphone access in Settings to record drafts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to Settings',
          onPress: () => {
            void Linking.openSettings();
          },
        },
      ],
    );
    return false;
  }

  async function handleStart() {
    if (!(await ensureMic())) return;
    setElapsedMs(0);
    await verseAudio.start();
  }

  async function handleStop() {
    await verseAudio.stop();
  }

  async function handleReRecord() {
    if (!(await ensureMic())) return;
    setElapsedMs(0);
    await verseAudio.start();
  }

  function handleDelete() {
    Alert.alert(
      'Delete draft?',
      'This removes the draft recording for this verse.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void verseAudio.deleteCurrent();
          },
        },
      ],
    );
  }

  function requestVerseChange(next: number) {
    if (verseAudio.state === 'paused' || verseAudio.state === 'recording') {
      Alert.alert(
        'Recording in progress',
        'Stop or finish the current take before changing verses.',
        [{ text: 'OK' }],
      );
      return;
    }
    setSelectedVerse(next);
  }

  const showIdle = verseAudio.state === 'idle' || verseAudio.state === 'error';
  const showCapture =
    verseAudio.state === 'recording' || verseAudio.state === 'paused';
  const showReview =
    verseAudio.state === 'recorded' ||
    verseAudio.state === 'playing' ||
    verseAudio.state === 'saving';

  return (
    <View style={styles.container} testID="record-tab">
      <View style={styles.verseNav}>
        <TouchableOpacity
          onPress={() => {
            if (!prevDisabled) {
              requestVerseChange(verses[verseIndex - 1]!.verseNumber);
            }
          }}
          disabled={prevDisabled}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Previous verse"
          accessibilityState={{ disabled: prevDisabled }}
          testID="record-prev-verse"
        >
          <ChevronLeft
            size={iconSizes.header}
            color={
              prevDisabled
                ? theme.colors.mutedForeground
                : theme.colors.foreground
            }
            strokeWidth={listIconStrokeWidth}
            style={prevDisabled ? styles.dim : undefined}
          />
        </TouchableOpacity>
        <Text style={styles.reference} testID="record-verse-reference">
          {reference}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (!nextDisabled) {
              requestVerseChange(verses[verseIndex + 1]!.verseNumber);
            }
          }}
          disabled={nextDisabled}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Next verse"
          accessibilityState={{ disabled: nextDisabled }}
          testID="record-next-verse"
        >
          <ChevronRight
            size={iconSizes.header}
            color={
              nextDisabled
                ? theme.colors.mutedForeground
                : theme.colors.foreground
            }
            strokeWidth={listIconStrokeWidth}
            style={nextDisabled ? styles.dim : undefined}
          />
        </TouchableOpacity>
      </View>

      {showCapture || showReview ? (
        <View style={styles.waveformWrap}>
          <PlaybackProgressBar
            positionMs={showCapture ? elapsedMs : verseAudio.positionMs}
            durationMs={
              showCapture ? Math.max(elapsedMs, 1) : verseAudio.durationMs
            }
          />
        </View>
      ) : null}

      <View style={styles.controls}>
        {syncingMessage ? (
          <Text style={styles.syncHint} testID="record-syncing-hint">
            {syncingMessage}
          </Text>
        ) : null}

        {showIdle ? (
          <View style={styles.idleGroup}>
            <TouchableOpacity
              style={[styles.recordCircle, recordDisabled && styles.disabled]}
              onPress={() => {
                void handleStart();
              }}
              disabled={recordDisabled}
              accessibilityRole="button"
              accessibilityLabel={`Record ${reference}`}
              testID="record-start-button"
            >
              <CircleDot
                size={44}
                color={theme.colors.primaryForeground}
                strokeWidth={listIconStrokeWidth}
              />
            </TouchableOpacity>
            <Text style={styles.recordLabel}>Record {reference}</Text>
            <View style={styles.mutedPlay}>
              <Play
                size={22}
                color={theme.colors.mutedForeground}
                strokeWidth={listIconStrokeWidth}
              />
            </View>
          </View>
        ) : null}

        {showCapture ? (
          <View style={styles.captureGroup}>
            <Text style={styles.duration} testID="record-duration">
              {formatDuration(elapsedMs)}
            </Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.secondaryCircle}
                onPress={() => {
                  void (verseAudio.state === 'paused'
                    ? verseAudio.resume()
                    : verseAudio.pause());
                }}
                accessibilityRole="button"
                accessibilityLabel={
                  verseAudio.state === 'paused' ? 'Resume recording' : 'Pause'
                }
                testID="record-pause-button"
              >
                {verseAudio.state === 'paused' ? (
                  <CircleDot
                    size={28}
                    color={theme.colors.primaryForeground}
                    strokeWidth={listIconStrokeWidth}
                  />
                ) : (
                  <Pause
                    size={28}
                    color={theme.colors.primaryForeground}
                    strokeWidth={listIconStrokeWidth}
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopCircle}
                onPress={() => {
                  void handleStop();
                }}
                accessibilityRole="button"
                accessibilityLabel="Stop recording"
                testID="record-stop-button"
              >
                <Square
                  size={28}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
            </View>
            {verseAudio.state === 'paused' ? (
              <Text style={styles.hint}>
                Recording paused — resume or stop to commit the take.
              </Text>
            ) : null}
          </View>
        ) : null}

        {showReview ? (
          <View style={styles.reviewGroup}>
            <TouchableOpacity
              style={styles.playCircle}
              onPress={() => {
                void verseAudio.play();
              }}
              accessibilityRole="button"
              accessibilityLabel="Play draft"
              testID="record-play-button"
            >
              <Play
                size={28}
                color={theme.colors.primaryForeground}
                strokeWidth={listIconStrokeWidth}
              />
            </TouchableOpacity>
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.textAction}
                onPress={() => {
                  void handleReRecord();
                }}
                testID="record-rerecord-button"
              >
                <RefreshCw
                  size={20}
                  color={theme.colors.foreground}
                  strokeWidth={listIconStrokeWidth}
                />
                <Text style={styles.textActionLabel}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.textAction}
                onPress={handleDelete}
                testID="record-delete-button"
              >
                <Trash2
                  size={20}
                  color={theme.colors.foreground}
                  strokeWidth={listIconStrokeWidth}
                />
                <Text style={styles.textActionLabel}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSourceExpanded(v => !v);
        }}
        style={styles.accordion}
        accessibilityRole="button"
        testID="record-source-toggle"
      >
        <Text style={styles.accordionLabel}>
          {sourceExpanded ? 'Hide source text' : 'Show source text'}
        </Text>
        {sourceExpanded ? (
          <ChevronUp
            size={iconSizes.chevron}
            color={theme.colors.foreground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <ChevronDown
            size={iconSizes.chevron}
            color={theme.colors.foreground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>
      {sourceExpanded && selected?.text ? (
        <View style={styles.sourceBody} testID="record-source-body">
          <Text style={styles.sourceText}>{selected.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  verseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: { padding: theme.spacing.sm },
  reference: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  dim: { opacity: 0.35 },
  waveformWrap: { minHeight: 36 },
  controls: { alignItems: 'center', gap: theme.spacing.md },
  syncHint: {
    color: theme.colors.mutedForeground,
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
  },
  idleGroup: { alignItems: 'center', gap: theme.spacing.sm },
  recordCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  recordLabel: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
    fontWeight: theme.typography.weights.medium,
  },
  mutedPlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureGroup: { alignItems: 'center', gap: theme.spacing.sm },
  duration: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  row: { flexDirection: 'row', gap: theme.spacing.lg, alignItems: 'center' },
  secondaryCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: theme.colors.mutedForeground,
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
  },
  reviewGroup: { alignItems: 'center', gap: theme.spacing.md },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textActionLabel: {
    color: theme.colors.foreground,
    fontSize: theme.typography.sizes.sm,
  },
  accordion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
  },
  accordionLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  sourceBody: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
  },
  sourceText: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
});
