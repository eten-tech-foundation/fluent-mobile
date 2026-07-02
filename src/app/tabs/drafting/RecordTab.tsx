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
  StopCircle,
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

interface RecordTabProps {
  bookName: string;
  chapterNumber: number;
  verses: VerseData[];
  selectedVerseNumber: number;
  bibleTextIdForSelectedVerse: number | null;
  onSelectVerse: (verseNumber: number) => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
    if (!canGoPrev) return;
    withPausedGuard(() => onSelectVerse(verses[verseIndex - 1]!.verseNumber));
  }

  function handleNext() {
    if (!canGoNext) return;
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
          accessibilityState={{ disabled: !canGoPrev }}
          disabled={!canGoPrev}
          style={styles.verseNavButton}
          testID="record-prev-verse"
        >
          <ChevronLeft
            size={iconSizes.header}
            color={
              canGoPrev ? theme.colors.foreground : theme.colors.mutedForeground
            }
            strokeWidth={listIconStrokeWidth}
            style={!canGoPrev ? styles.disabledIcon : undefined}
          />
        </TouchableOpacity>
        <Text style={styles.verseReference} testID="record-verse-reference">
          {currentReference}
        </Text>
        <TouchableOpacity
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel="Next verse"
          accessibilityState={{ disabled: !canGoNext }}
          disabled={!canGoNext}
          style={styles.verseNavButton}
          testID="record-next-verse"
        >
          <ChevronRight
            size={iconSizes.header}
            color={
              canGoNext ? theme.colors.foreground : theme.colors.mutedForeground
            }
            strokeWidth={listIconStrokeWidth}
            style={!canGoNext ? styles.disabledIcon : undefined}
          />
        </TouchableOpacity>
      </View>

      {recorder.status === 'recording' || recorder.status === 'paused' ? (
        <View
          style={styles.waveform}
          testID="record-waveform-live"
          accessibilityLabel="Recording waveform"
        >
          {Array.from({ length: 24 }).map((_, index) => {
            const active = recorder.status === 'recording';
            const height =
              8 +
              ((Math.abs(Math.sin((recorder.elapsedMs + index * 40) / 90)) *
                24) |
                0);
            return (
              <View
                key={index}
                style={[
                  styles.waveformBar,
                  {
                    height: active ? height : 12,
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
          {Array.from({ length: 24 }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.waveformBar,
                {
                  height: 8 + ((Math.abs(Math.cos(index / 2)) * 20) | 0),
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
              style={styles.playButtonDisabled}
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
          <View style={styles.recordingRow}>
            <Text style={styles.duration} testID="record-duration">
              {formatDuration(recorder.elapsedMs)}
            </Text>
            <View style={styles.recordingButtons}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => recorder.pause()}
                accessibilityRole="button"
                accessibilityLabel="Pause recording"
                testID="record-pause-button"
              >
                <Pause
                  size={28}
                  color={theme.colors.foreground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={() => recorder.stop()}
                accessibilityRole="button"
                accessibilityLabel="Stop recording"
                testID="record-stop-button"
              >
                <StopCircle
                  size={32}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {recorder.status === 'paused' && (
          <View style={styles.recordingRow}>
            <Text style={styles.duration} testID="record-duration">
              {formatDuration(recorder.elapsedMs)}
            </Text>
            <View style={styles.recordingButtons}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => recorder.resume()}
                accessibilityRole="button"
                accessibilityLabel="Resume recording"
                testID="record-resume-button"
              >
                <CircleDot
                  size={28}
                  color={theme.colors.foreground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stopButton}
                onPress={() => recorder.stop()}
                accessibilityRole="button"
                accessibilityLabel="Stop recording"
                testID="record-stop-button"
              >
                <StopCircle
                  size={32}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {recorder.status === 'review' && (
          <View style={styles.reviewGroup}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => {
                // Playback is stubbed until #47 pipes the chapter audio player.
                // Individual take playback still runs via expo-audio in future work.
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
            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleReRecordPress}
                accessibilityRole="button"
                accessibilityLabel="Re-record draft"
                testID="record-rerecord-button"
              >
                <CircleDot
                  size={22}
                  color={theme.colors.foreground}
                  strokeWidth={listIconStrokeWidth}
                />
                <Text style={styles.buttonLabel}>Re-record</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.destructiveButton}
                onPress={handleDeletePress}
                accessibilityRole="button"
                accessibilityLabel="Delete draft"
                testID="record-delete-button"
              >
                <Trash2
                  size={22}
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
    justifyContent: 'space-between',
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
    height: 40,
  },
  waveformBar: {
    width: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
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
  playButtonDisabled: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    opacity: 0.6,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  recordingButtons: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  duration: {
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    fontVariant: ['tabular-nums'],
    color: theme.colors.foreground,
  },
  secondaryButton: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  stopButton: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  buttonLabel: {
    color: theme.colors.foreground,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  destructiveLabel: {
    color: theme.colors.destructive,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  reviewGroup: {
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  destructiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
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
