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
import { SourceAudioPlayerBar } from '../../components/layout/SourceAudioPlayerBar';
import { RootStackParamList } from '../../types/navigation/types';
import { ChapterAssignmentData } from '../../types/db/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Route = RouteProp<RootStackParamList, 'VerseDetail'>;

/** Design timer: `0:13` (no leading zero on minutes). */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type RecordTabProps = {
  chapterData: ChapterAssignmentData;
};

/**
 * Record tab — draft capture / review for the selected drafting verse.
 * Visual states follow docs/design/record-tab/01–04 (Matt).
 * Built on useVerseAudio (#97); kill-safe ADTS multi-segment pause is #176/#170.
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
  const isRecording = verseAudio.state === 'recording';
  const isPaused = verseAudio.state === 'paused';
  const showCapture = isRecording || isPaused;
  const showReview =
    verseAudio.state === 'recorded' ||
    verseAudio.state === 'playing' ||
    verseAudio.state === 'saving';
  const showSourceAudio = showIdle || showReview;
  const isPlaying = verseAudio.state === 'playing';

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

      <View style={styles.main}>
        {showCapture || showReview ? (
          <View style={styles.waveformWrap} testID="record-waveform">
            <PlaybackProgressBar
              positionMs={showCapture ? elapsedMs : verseAudio.positionMs}
              durationMs={
                showCapture ? Math.max(elapsedMs, 1) : verseAudio.durationMs
              }
              barCount={22}
              tall
              accentColor={
                isRecording ? theme.colors.recordAccent : theme.colors.primary
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
              <View
                style={styles.mutedPlay}
                accessibilityRole="button"
                accessibilityLabel="Playback unavailable until a draft is recorded"
                accessibilityState={{ disabled: true }}
                testID="record-play-idle-placeholder"
              >
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
                  style={styles.stopCircle}
                  onPress={() => {
                    void handleStop();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Stop recording"
                  testID="record-stop-button"
                >
                  <Square
                    size={26}
                    color={theme.colors.foreground}
                    strokeWidth={listIconStrokeWidth}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryRecordCircle}
                  onPress={() => {
                    void (isPaused ? verseAudio.resume() : verseAudio.pause());
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={isPaused ? 'Resume recording' : 'Pause'}
                  testID={
                    isPaused ? 'record-resume-button' : 'record-pause-button'
                  }
                >
                  {isPaused ? (
                    <CircleDot
                      size={30}
                      color={theme.colors.primaryForeground}
                      strokeWidth={listIconStrokeWidth}
                    />
                  ) : (
                    <Pause
                      size={30}
                      color={theme.colors.primaryForeground}
                      strokeWidth={listIconStrokeWidth}
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint} testID="record-tip">
                {isPaused
                  ? 'Recording paused — review the source below, then resume.'
                  : 'Tap pause to study the source, stop to finish.'}
              </Text>
            </View>
          ) : null}

          {showReview ? (
            <View style={styles.reviewGroup}>
              <View style={styles.row}>
                <View
                  style={styles.mutedPlay}
                  accessibilityRole="image"
                  accessibilityLabel="Recording complete"
                  testID="record-review-secondary"
                >
                  <CircleDot
                    size={22}
                    color={theme.colors.mutedForeground}
                    strokeWidth={listIconStrokeWidth}
                  />
                </View>
                <TouchableOpacity
                  style={styles.playCircle}
                  onPress={() => {
                    void verseAudio.play();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? 'Pause draft' : 'Play draft'}
                  testID="record-play-button"
                >
                  {isPlaying ? (
                    <Pause
                      size={30}
                      color={theme.colors.primaryForeground}
                      strokeWidth={listIconStrokeWidth}
                    />
                  ) : (
                    <Play
                      size={30}
                      color={theme.colors.primaryForeground}
                      strokeWidth={listIconStrokeWidth}
                    />
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.reviewActions}>
                <TouchableOpacity
                  style={[
                    styles.reRecordButton,
                    recordDisabled && styles.disabled,
                  ]}
                  onPress={() => {
                    void handleReRecord();
                  }}
                  disabled={recordDisabled}
                  testID="record-rerecord-button"
                >
                  <RefreshCw
                    size={18}
                    color={theme.colors.foreground}
                    strokeWidth={listIconStrokeWidth}
                  />
                  <Text style={styles.reRecordLabel}>Re-record</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                  testID="record-delete-button"
                >
                  <Trash2
                    size={18}
                    color={theme.colors.destructive}
                    strokeWidth={listIconStrokeWidth}
                  />
                  <Text style={styles.deleteLabel}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => {
            LayoutAnimation.configureNext(
              LayoutAnimation.Presets.easeInEaseOut,
            );
            setSourceExpanded(v => !v);
          }}
          style={styles.sourceLink}
          accessibilityRole="button"
          accessibilityLabel={
            sourceExpanded ? 'Hide source text' : 'View source text'
          }
          testID="record-source-toggle"
        >
          {sourceExpanded ? (
            <ChevronUp
              size={iconSizes.chevron}
              color={theme.colors.primary}
              strokeWidth={listIconStrokeWidth}
            />
          ) : (
            <ChevronDown
              size={iconSizes.chevron}
              color={theme.colors.primary}
              strokeWidth={listIconStrokeWidth}
            />
          )}
          <Text style={styles.sourceLinkLabel}>
            {sourceExpanded ? 'Hide source text' : 'View source text'}
          </Text>
        </TouchableOpacity>
        {sourceExpanded && selected?.text ? (
          <View style={styles.sourceBody} testID="record-source-body">
            <Text style={styles.sourceText}>{selected.text}</Text>
          </View>
        ) : null}
      </View>

      {showSourceAudio ? (
        <SourceAudioPlayerBar
          verses={verses}
          selectedVerse={selectedVerse}
          sourceLabel={chapterData.bibleName ?? 'Source'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  verseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  navBtn: { padding: theme.spacing.sm },
  reference: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  dim: { opacity: 0.35 },
  main: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  waveformWrap: {
    minHeight: 72,
    width: '55%',
    alignSelf: 'center',
  },
  controls: { alignItems: 'center', gap: theme.spacing.md },
  syncHint: {
    color: theme.colors.mutedForeground,
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
  },
  idleGroup: { alignItems: 'center', gap: theme.spacing.md },
  recordCircle: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.recordAccent,
    borderWidth: 4,
    borderColor: theme.colors.primaryForeground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryRecordCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.recordAccent,
    borderWidth: 3,
    borderColor: theme.colors.primaryForeground,
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
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  captureGroup: { alignItems: 'center', gap: theme.spacing.md },
  duration: {
    fontSize: 32,
    fontWeight: theme.typography.weights.medium,
    fontVariant: ['tabular-nums'],
    color: theme.colors.mutedForeground,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    alignItems: 'center',
  },
  stopCircle: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    // Light shadow for white stop control (design)
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  hint: {
    color: theme.colors.mutedForeground,
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  reviewGroup: { alignItems: 'center', gap: theme.spacing.lg },
  playCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  reRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardBackground,
  },
  reRecordLabel: {
    color: theme.colors.foreground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    backgroundColor: theme.colors.background,
  },
  deleteLabel: {
    color: theme.colors.destructive,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  sourceLinkLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primary,
  },
  sourceBody: {
    padding: theme.spacing.md,
  },
  sourceText: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
});
