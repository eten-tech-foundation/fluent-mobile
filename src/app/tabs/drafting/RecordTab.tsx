import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../theme';
import { iconSizes, listIconStrokeWidth } from '../../../theme/iconSpecs';
import type { VerseData } from '../../../types/db/types';
import { useRecorder } from '../../../hooks/useRecorder';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const LIVE_WAVEFORM_BARS = 22;

interface RecordTabProps {
  bookName: string;
  chapterNumber: number;
  verses: VerseData[];
  selectedVerseNumber: number;
  bibleTextIdForSelectedVerse: number | null;
  onSelectVerse: (verseNumber: number) => void;
}

function formatDuration(ms: number): string {
  const safeMs = ms < 0 ? 0 : ms;
  const totalCentis = Math.floor(safeMs / 10);
  const totalSeconds = Math.floor(totalCentis / 100);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = totalCentis % 100;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}:${pad(centis)}`;
}

function verseReference(bookName: string, chapter: number, verse: number) {
  return `${bookName} ${chapter}:${verse}`;
}

export function RecordTab({
  bookName,
  chapterNumber,
  verses,
  selectedVerseNumber,
  bibleTextIdForSelectedVerse,
  onSelectVerse,
}: RecordTabProps) {
  const navigation = useNavigation();
  const recorder = useRecorder({
    bibleTextId: bibleTextIdForSelectedVerse,
  });
  const [sourceExpanded, setSourceExpanded] = useState(false);

  const currentReference = verseReference(
    bookName,
    chapterNumber,
    selectedVerseNumber,
  );

  const verseIndex = verses.findIndex(
    v => v.verseNumber === selectedVerseNumber,
  );
  const canGoPrev = verseIndex > 0;
  const canGoNext = verseIndex >= 0 && verseIndex < verses.length - 1;
  // Verse navigation is locked mid-recording so the take stays anchored to
  // the verse the user started on. Paused/idle/review keep their own guards.
  const isRecordingLocked = recorder.status === 'recording';
  const prevDisabled = !canGoPrev || isRecordingLocked;
  const nextDisabled = !canGoNext || isRecordingLocked;

  const sourceText = useMemo(
    () => verses.find(v => v.verseNumber === selectedVerseNumber)?.text ?? '',
    [verses, selectedVerseNumber],
  );

  useEffect(() => {
    if (recorder.status !== 'paused') return;

    const beforeRemove = (event: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => {
      event.preventDefault();
      Alert.alert(
        'Recording in progress',
        'You have a paused recording. Resume it or discard the take before leaving.',
        [
          { text: 'Resume', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              await recorder.discardPaused();
              // Re-dispatch original navigation action after discarding.
              (
                navigation as unknown as { dispatch: (a: unknown) => void }
              ).dispatch(event.data.action);
            },
          },
        ],
      );
    };

    const unsubscribe = (
      navigation as unknown as {
        addListener: (
          event: 'beforeRemove',
          cb: typeof beforeRemove,
        ) => () => void;
      }
    ).addListener('beforeRemove', beforeRemove);

    return unsubscribe;
  }, [navigation, recorder]);

  function withPausedGuard(action: () => void) {
    if (recorder.status === 'paused') {
      Alert.alert(
        'Recording in progress',
        'Resume or discard the paused take before switching verses.',
        [
          { text: 'Resume', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              await recorder.discardPaused();
              action();
            },
          },
        ],
      );
      return;
    }
    action();
  }

  function handlePrev() {
    if (prevDisabled) return;
    withPausedGuard(() => onSelectVerse(verses[verseIndex - 1]!.verseNumber));
  }

  function handleNext() {
    if (nextDisabled) return;
    withPausedGuard(() => onSelectVerse(verses[verseIndex + 1]!.verseNumber));
  }

  function toggleSource() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSourceExpanded(prev => !prev);
  }

  function showMicBlockedAlert() {
    Alert.alert(
      'Microphone access required',
      'Fluent needs microphone access to record verses. Enable it in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to Settings',
          onPress: () => {
            Linking.openSettings().catch(() => undefined);
          },
        },
      ],
    );
  }

  /**
   * Ensures microphone permission is granted, prompting the OS dialog when
   * possible and only surfacing the Settings deep-link when the OS suppresses
   * the prompt (permanent denial). Returns whether recording may proceed.
   */
  async function ensureMicPermission(): Promise<boolean> {
    if (recorder.permission === 'granted') return true;
    if (recorder.permission === 'blocked') {
      showMicBlockedAlert();
      return false;
    }
    const { granted, canAskAgain } = await recorder.requestPermission();
    if (granted) return true;
    if (!canAskAgain) showMicBlockedAlert();
    return false;
  }

  async function handleStartPress() {
    if (!(await ensureMicPermission())) return;
    await recorder.start();
  }

  async function handleReRecordPress() {
    if (!(await ensureMicPermission())) return;
    await recorder.reRecord();
  }

  async function handleDeletePress() {
    Alert.alert('Delete draft?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await recorder.deleteCurrent();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.verseNav}>
        <TouchableOpacity
          onPress={handlePrev}
          accessibilityRole="button"
          accessibilityLabel="Previous verse"
          accessibilityState={{ disabled: prevDisabled }}
          disabled={prevDisabled}
          style={styles.verseNavButton}
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
            style={prevDisabled ? styles.disabledIcon : undefined}
          />
        </TouchableOpacity>
        <Text style={styles.verseReference} testID="record-verse-reference">
          {currentReference}
        </Text>
        <TouchableOpacity
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel="Next verse"
          accessibilityState={{ disabled: nextDisabled }}
          disabled={nextDisabled}
          style={styles.verseNavButton}
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
            style={nextDisabled ? styles.disabledIcon : undefined}
          />
        </TouchableOpacity>
      </View>

      {recorder.status === 'recording' || recorder.status === 'paused' ? (
        <View
          style={styles.waveform}
          testID="record-waveform-live"
          accessibilityLabel="Recording waveform"
        >
          {Array.from({ length: LIVE_WAVEFORM_BARS }).map((_, index) => {
            const active = recorder.status === 'recording';
            const height =
              14 +
              ((Math.abs(Math.sin((recorder.elapsedMs + index * 40) / 90)) *
                48) |
                0);
            return (
              <View
                key={index}
                style={[
                  styles.waveformBarLive,
                  {
                    height: active ? height : 14,
                    opacity: active ? 1 : 0.5,
                  },
                ]}
              />
            );
          })}
        </View>
      ) : recorder.status === 'review' ? (
        <View
          style={styles.waveform}
          testID="record-waveform-static"
          accessibilityLabel="Draft waveform"
        >
          {Array.from({ length: LIVE_WAVEFORM_BARS }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.waveformBarStatic,
                {
                  height: 10 + ((Math.abs(Math.cos(index / 2)) * 28) | 0),
                  opacity: 0.85,
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.controls}>
        {recorder.status === 'idle' && (
          <View style={styles.idleGroup}>
            <TouchableOpacity
              style={styles.recordButtonCircle}
              onPress={handleStartPress}
              accessibilityRole="button"
              accessibilityLabel={`Record ${currentReference}`}
              testID="record-start-button"
            >
              <CircleDot
                size={44}
                color={theme.colors.primaryForeground}
                strokeWidth={listIconStrokeWidth}
              />
            </TouchableOpacity>
            <Text style={styles.recordButtonLabel} testID="record-start-label">
              Record {currentReference}
            </Text>
            <View
              style={styles.mutedPlaceholderCircle}
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
        )}

        {recorder.status === 'recording' && (
          <View style={styles.captureGroup}>
            <Text style={styles.duration} testID="record-duration">
              {formatDuration(recorder.elapsedMs)}
            </Text>
            <View style={styles.captureButtonsRow}>
              <TouchableOpacity
                style={styles.stopCircleButton}
                onPress={() => recorder.stop()}
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
                style={styles.primaryActionCircle}
                onPress={() => recorder.pause()}
                accessibilityRole="button"
                accessibilityLabel="Pause recording"
                testID="record-pause-button"
              >
                <Pause
                  size={30}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.captureTip} testID="record-tip">
              Tap pause to study the source, stop to finish.
            </Text>
          </View>
        )}

        {recorder.status === 'paused' && (
          <View style={styles.captureGroup}>
            <Text style={styles.duration} testID="record-duration">
              {formatDuration(recorder.elapsedMs)}
            </Text>
            <View style={styles.captureButtonsRow}>
              <TouchableOpacity
                style={styles.stopCircleButton}
                onPress={() => recorder.stop()}
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
                style={styles.primaryActionCircle}
                onPress={() => recorder.resume()}
                accessibilityRole="button"
                accessibilityLabel="Resume recording"
                testID="record-resume-button"
              >
                <CircleDot
                  size={30}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
            </View>
            <Text style={styles.captureTip} testID="record-tip">
              Recording paused — review the source below, then resume.
            </Text>
          </View>
        )}

        {recorder.status === 'review' && (
          <View style={styles.reviewGroup}>
            <View style={styles.captureButtonsRow}>
              <View
                style={styles.mutedPlaceholderCircle}
                accessibilityRole="image"
                accessibilityLabel="Recording complete"
                testID="record-review-record-done-placeholder"
              >
                <CircleDot
                  size={22}
                  color={theme.colors.mutedForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </View>
              <TouchableOpacity
                style={styles.primaryPlayCircle}
                onPress={() => {
                  // Playback is stubbed until #47 pipes the chapter audio player.
                  // Individual take playback still runs via expo-audio in future work.
                }}
                accessibilityRole="button"
                accessibilityLabel="Play draft"
                testID="record-play-button"
              >
                <Play
                  size={30}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.reRecordButton}
                onPress={handleReRecordPress}
                accessibilityRole="button"
                accessibilityLabel="Re-record draft"
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
                style={styles.destructiveButton}
                onPress={handleDeletePress}
                accessibilityRole="button"
                accessibilityLabel="Delete draft"
                testID="record-delete-button"
              >
                <Trash2
                  size={18}
                  color={theme.colors.destructive}
                  strokeWidth={listIconStrokeWidth}
                />
                <Text style={styles.destructiveLabel}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={toggleSource}
        style={styles.accordionHeader}
        accessibilityRole="button"
        accessibilityLabel={
          sourceExpanded ? 'Hide source text' : 'Show source text'
        }
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
      {sourceExpanded && (
        <View style={styles.sourceBody} testID="record-source-body">
          <Text style={styles.sourceText}>{sourceText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  verseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  verseNavButton: {
    padding: theme.spacing.sm,
  },
  verseReference: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  disabledIcon: {
    opacity: 0.35,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 72,
    width: '50%',
    alignSelf: 'center',
  },
  waveformBarLive: {
    width: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.recordAccent,
  },
  waveformBarStatic: {
    width: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.primary,
  },
  controls: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  idleGroup: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  recordButtonCircle: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.recordAccent,
  },
  recordButtonLabel: {
    color: theme.colors.foreground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    textAlign: 'center',
  },
  mutedPlaceholderCircle: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    opacity: 0.6,
  },
  captureGroup: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  captureButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  captureTip: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
  duration: {
    fontSize: 32,
    fontWeight: theme.typography.weights.medium,
    fontVariant: ['tabular-nums'],
    color: theme.colors.mutedForeground,
  },
  stopCircleButton: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primaryActionCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.recordAccent,
  },
  reviewGroup: {
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  primaryPlayCircle: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
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
  destructiveButton: {
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
  destructiveLabel: {
    color: theme.colors.destructive,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
  },
  accordionHeader: {
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
  },
  sourceText: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
});
