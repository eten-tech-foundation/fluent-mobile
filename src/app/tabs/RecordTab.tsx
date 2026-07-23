import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
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
  Square,
} from 'lucide-react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { useDraftingContext } from '../context/DraftingContext';
import { getBibleTextId } from '../../db/queries';
import { useVerseAudio } from '../../hooks/useVerseAudio';
import { requestMicPermission } from '../../audio/micPermission';
import { PlaybackProgressBar } from '../../components/ui/PlaybackProgressBar';
import { DraftTakeRow } from '../../components/ui/DraftTakeRow';
import { RecordCircleButton } from '../../components/ui/RecordCircleButton';
import { SourceTextAccordion } from '../../components/ui/SourceTextAccordion';
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
  /**
   * Notifies DraftingScreen when an in-progress capture should block tab
   * switches (recording/paused). Keep Record mounted while hidden so the
   * native session survives tab switches — unmounting tears down expo-audio's
   * recorder.
   */
  onCaptureActiveChange?: (active: boolean) => void;
};

/**
 * Record tab — draft capture / review for the selected drafting verse.
 * Visual states follow docs/design/record-tab/01–04 + Lovable chrome.
 * Built on useVerseAudio (#97); kill-safe ADTS multi-segment pause is #176/#170.
 */
export function RecordTab({
  chapterData,
  onCaptureActiveChange,
}: RecordTabProps) {
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
  const takeNumber = verseAudio.latest?.takeNumber;
  const hasTake = Boolean(verseAudio.latest);

  useEffect(() => {
    let cancelled = false;
    // Clear immediately so we never keep the previous verse's id while lookup runs.
    setBibleTextId(null);
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

  useEffect(() => {
    const active =
      verseAudio.state === 'recording' || verseAudio.state === 'paused';
    onCaptureActiveChange?.(active);
    return () => onCaptureActiveChange?.(false);
  }, [verseAudio.state, onCaptureActiveChange]);

  useEffect(() => {
    if (!verseAudio.errorMessage) return;
    Alert.alert('Audio error', verseAudio.errorMessage);
  }, [verseAudio.errorMessage]);

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

  // error + no take → idle chrome; error after a saved take → keep review so
  // a failed play/delete doesn't look like the draft vanished.
  const showIdle =
    verseAudio.state === 'idle' ||
    (verseAudio.state === 'error' && !hasTake);
  const isRecording = verseAudio.state === 'recording';
  const isPaused = verseAudio.state === 'paused';
  const showCapture = isRecording || isPaused;
  const showReview =
    verseAudio.state === 'recorded' ||
    verseAudio.state === 'playing' ||
    verseAudio.state === 'saving' ||
    (verseAudio.state === 'error' && hasTake);
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
        {showCapture ? (
          <View style={styles.waveformWrap} testID="record-waveform">
            <PlaybackProgressBar
              positionMs={elapsedMs}
              durationMs={Math.max(elapsedMs, 1)}
              barCount={28}
              tall
              animate={isRecording}
              accentColor={
                isRecording
                  ? theme.colors.recordAccent
                  : theme.colors.waveformActive
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
              <RecordCircleButton
                variant="record"
                onPress={() => {
                  void handleStart();
                }}
                disabled={recordDisabled}
                accessibilityLabel={`Record ${reference}`}
                testID="record-start-button"
              >
                <CircleDot
                  size={iconSizes.recordIdleGlyph}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </RecordCircleButton>
              <Text style={styles.recordLabel}>Record {reference}</Text>
              <RecordCircleButton
                variant="muted"
                disabled
                accessibilityLabel="Playback unavailable until a draft is recorded"
                testID="record-play-idle-placeholder"
              >
                <Play
                  size={iconSizes.headerTab}
                  color={theme.colors.mutedForeground}
                  strokeWidth={listIconStrokeWidth}
                />
              </RecordCircleButton>
            </View>
          ) : null}

          {showCapture ? (
            <View style={styles.captureGroup}>
              <Text style={styles.duration} testID="record-duration">
                {formatDuration(elapsedMs)}
              </Text>
              <View style={styles.row}>
                <RecordCircleButton
                  variant="stop"
                  onPress={() => {
                    void handleStop();
                  }}
                  accessibilityLabel="Stop recording"
                  testID="record-stop-button"
                >
                  <Square
                    size={iconSizes.header}
                    color={theme.colors.foreground}
                    strokeWidth={listIconStrokeWidth}
                  />
                </RecordCircleButton>
                <RecordCircleButton
                  variant="primary"
                  onPress={() => {
                    void (isPaused ? verseAudio.resume() : verseAudio.pause());
                  }}
                  accessibilityLabel={isPaused ? 'Resume recording' : 'Pause'}
                  testID={
                    isPaused ? 'record-resume-button' : 'record-pause-button'
                  }
                >
                  {isPaused ? (
                    <CircleDot
                      size={iconSizes.recordPrimaryGlyph}
                      color={theme.colors.primaryForeground}
                      strokeWidth={listIconStrokeWidth}
                    />
                  ) : (
                    <Pause
                      size={iconSizes.recordPrimaryGlyph}
                      color={theme.colors.primaryForeground}
                      strokeWidth={listIconStrokeWidth}
                    />
                  )}
                </RecordCircleButton>
              </View>
              <Text
                style={[styles.hint, isPaused && styles.hintPaused]}
                testID="record-tip"
              >
                {isPaused
                  ? 'Recording paused — review the source below, then resume.'
                  : 'Tap pause to study the source, stop to finish.'}
              </Text>
            </View>
          ) : null}

          {showReview ? (
            <View style={styles.reviewGroup}>
              {typeof takeNumber === 'number' && takeNumber > 0 ? (
                <DraftTakeRow
                  takeNumber={takeNumber}
                  positionMs={verseAudio.positionMs}
                  durationMs={verseAudio.durationMs}
                  isPlaying={isPlaying}
                  onPlayPause={() => {
                    void (isPlaying
                      ? verseAudio.pausePlayback()
                      : verseAudio.play());
                  }}
                  onDelete={handleDelete}
                />
              ) : null}
              <TouchableOpacity
                style={[
                  styles.newTakeButton,
                  recordDisabled && styles.disabled,
                ]}
                onPress={() => {
                  void handleReRecord();
                }}
                disabled={recordDisabled}
                accessibilityRole="button"
                accessibilityLabel="Record new take"
                testID="record-new-take-button"
              >
                <CircleDot
                  size={iconSizes.headerTab}
                  color={theme.colors.primaryForeground}
                  strokeWidth={listIconStrokeWidth}
                />
                <Text style={styles.newTakeLabel}>Record New Take</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <SourceTextAccordion
          expanded={sourceExpanded}
          onToggle={() => setSourceExpanded(v => !v)}
          text={selected?.text}
        />
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
    minHeight: theme.waveform.tallHeight,
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: theme.spacing.sm,
  },
  controls: { alignItems: 'center', gap: theme.spacing.md, width: '100%' },
  syncHint: {
    color: theme.colors.mutedForeground,
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
  },
  idleGroup: { alignItems: 'center', gap: theme.spacing.md },
  disabled: { opacity: 0.4 },
  recordLabel: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
    fontWeight: theme.typography.weights.medium,
  },
  captureGroup: { alignItems: 'center', gap: theme.spacing.md },
  duration: {
    fontSize: theme.typography.sizes.display,
    fontWeight: theme.typography.weights.medium,
    fontVariant: ['tabular-nums'],
    color: theme.colors.mutedForeground,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    alignItems: 'center',
  },
  hint: {
    color: theme.colors.mutedForeground,
    fontSize: theme.typography.sizes.sm,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  hintPaused: {
    color: theme.colors.foreground,
    fontWeight: theme.typography.weights.semibold,
  },
  reviewGroup: {
    alignItems: 'center',
    gap: theme.spacing.lg,
    width: '100%',
  },
  newTakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xxl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.recordAccent,
    ...theme.shadows.elevated,
  },
  newTakeLabel: {
    color: theme.colors.primaryForeground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
});
