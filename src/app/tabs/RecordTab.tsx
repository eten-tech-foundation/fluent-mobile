import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  SectionList,
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
import { useLocalSearchParams } from 'expo-router';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { useDraftingContext } from '../context/DraftingContext';
import { getBibleTextId } from '../../db/queries';
import { useVerseAudio } from '../../hooks/useVerseAudio';
import { requestMicPermission } from '../../audio/micPermission';
import { PlaybackProgressBar } from '../../components/ui/PlaybackProgressBar';
import { DraftTakeRow } from '../../components/ui/DraftTakeRow';
import { SharedTakeRow } from '../../components/ui/SharedTakeRow';
import { TakeGroupHeader } from '../../components/ui/TakeGroupHeader';
import { RecordCircleButton } from '../../components/ui/RecordCircleButton';
import { SourceTextAccordion } from '../../components/ui/SourceTextAccordion';
import { SourceAudioPlayerBar } from '../../components/layout/SourceAudioPlayerBar';
import { parseRequiredString } from '../../navigation/routeParams';
import { ChapterAssignmentData } from '../../types/db/types';
import type { Recording, RecordingWithOwner } from '../../types/db/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

/** Design timer: `0:13` (no leading zero on minutes). */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type TakeSection = {
  title: string;
  ownerId: number | null;
  data: RecordingWithOwner[];
};

function groupTakesByOwner(takes: RecordingWithOwner[]): TakeSection[] {
  const sections: TakeSection[] = [];
  for (const take of takes) {
    const ownerId = take.recordedByUserId ?? null;
    const last = sections[sections.length - 1];
    if (last && last.ownerId === ownerId) {
      last.data.push(take);
    } else {
      sections.push({
        title: take.ownerDisplayName,
        ownerId,
        data: [take],
      });
    }
  }
  return sections;
}

type RecordTabProps = {
  chapterData: ChapterAssignmentData;
  onCaptureActiveChange?: (active: boolean) => void;
};

/**
 * Record tab — draft capture / review for the selected drafting verse.
 * Built on useVerseAudio (#97). Multi-take Review list is #71 — takes are
 * ordered by take_number ASC; exclusive playback is enforced by the single
 * playback engine inside useVerseAudio (tracked via playingTakeId).
 * Cross-account All Takes toggle + canonical designation is #279.
 */
export function RecordTab({
  chapterData,
  onCaptureActiveChange,
}: RecordTabProps) {
  const rawParams = useLocalSearchParams<{ chapterName?: string }>();
  const chapterName = parseRequiredString(rawParams.chapterName, 'chapterName');
  const { verses, selectedVerse, setSelectedVerse, refreshRecordedVerses } =
    useDraftingContext();
  const [bibleTextId, setBibleTextId] = useState<number | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [takeView, setTakeView] = useState<'mine' | 'all'>('mine');

  const verseAudio = useVerseAudio({ bibleTextId });
  const verseIndex = verses.findIndex(v => v.verseNumber === selectedVerse);
  const prevDisabled = verseIndex <= 0;
  const nextDisabled = verseIndex < 0 || verseIndex >= verses.length - 1;
  const selected = verses.find(v => v.verseNumber === selectedVerse);
  const reference = `${chapterName}:${selectedVerse}`;
  const hasTake = verseAudio.takes.length > 0;
  const hasAnyTake = hasTake || verseAudio.allTakes.length > 0;
  const activeViewHasTakes = takeView === 'mine' ? hasTake : hasAnyTake;

  useEffect(() => {
    setTakeView('mine');
  }, [bibleTextId]);

  useEffect(() => {
    void refreshRecordedVerses();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only takes should trigger this
  }, [verseAudio.takes]);

  useEffect(() => {
    if (!verseAudio.hasMultipleRecorders && takeView === 'all') {
      setTakeView('mine');
    }
  }, [verseAudio.hasMultipleRecorders, takeView]);

  useEffect(() => {
    let cancelled = false;
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

  /**
   * Non-selected take: delete immediately, no prompt.
   * Selected take: confirm first — deleting it hands off is_selected to the
   * next-highest take_number (recordingsRepository#deleteRecordingTake), or
   * returns the unit to Idle if it was the last one.
   */
  function handleDeleteTake(take: Recording) {
    const isSelected = take.id === verseAudio.selectedTake?.id;
    if (!isSelected) {
      void verseAudio.deleteTake(take.id);
      return;
    }
    Alert.alert(
      'Delete selected take?',
      `Take ${take.takeNumber} is currently selected as the active draft. Deleting it will select another take, or return to Idle if none remain.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void verseAudio.deleteTake(take.id);
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

  const showIdle =
    (verseAudio.state === 'idle' && !activeViewHasTakes) ||
    (verseAudio.state === 'error' && !activeViewHasTakes);
  const isRecording = verseAudio.state === 'recording';
  const isPaused = verseAudio.state === 'paused';
  const showCapture = isRecording || isPaused;
  const showReview =
    verseAudio.state === 'recorded' ||
    verseAudio.state === 'playing' ||
    verseAudio.state === 'saving' ||
    (verseAudio.state === 'error' && activeViewHasTakes) ||
    (verseAudio.state === 'idle' && activeViewHasTakes);
  const showSourceAudio = showIdle || showReview;

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

      {verseAudio.hasMultipleRecorders ? (
        <View style={styles.takeViewToggle} testID="take-view-toggle">
          <TouchableOpacity
            style={[
              styles.toggleOption,
              takeView === 'mine' && styles.toggleOptionActive,
            ]}
            onPress={() => {
              if (!showCapture) setTakeView('mine');
            }}
            disabled={showCapture}
            accessibilityRole="button"
            accessibilityState={{
              selected: takeView === 'mine',
              disabled: showCapture,
            }}
            testID="take-view-mine"
          >
            <Text
              style={[
                styles.toggleLabel,
                takeView === 'mine' && styles.toggleLabelActive,
              ]}
            >
              My Takes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleOption,
              takeView === 'all' && styles.toggleOptionActive,
            ]}
            onPress={() => {
              if (!showCapture) setTakeView('all');
            }}
            disabled={showCapture}
            accessibilityRole="button"
            accessibilityState={{
              selected: takeView === 'all',
              disabled: showCapture,
            }}
            testID="take-view-all"
          >
            <Text
              style={[
                styles.toggleLabel,
                takeView === 'all' && styles.toggleLabelActive,
                showCapture && styles.dim,
              ]}
            >
              All Takes
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[styles.main, showReview && styles.mainTopAligned]}>
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
                disabled={recordDisabled || !verseAudio.canRecordNewTake}
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
              {takeView === 'mine' ? (
                hasTake ? (
                  <FlatList
                    testID="record-take-list"
                    data={verseAudio.takes}
                    keyExtractor={take => take.id}
                    style={styles.takeList}
                    contentContainerStyle={styles.takeListContent}
                    renderItem={({ item: take }) => {
                      const isSelected =
                        take.id === verseAudio.selectedTake?.id;
                      const isLoaded = verseAudio.playingTakeId === take.id;
                      const isThisPlaying =
                        isLoaded && verseAudio.state === 'playing';
                      // Playback clears playingTakeId when a take reaches its end,
                      // but the take stays in the player and stays scrubbable.
                      // With nothing loaded yet, the selected draft still scrubs:
                      // `seek` loads it without playing (#176).
                      const isSeekable =
                        verseAudio.loadedTakeId === take.id ||
                        (verseAudio.loadedTakeId === null && isSelected);
                      const leadingIndicator = verseAudio.hasMultipleRecorders
                        ? 'canonicalReadOnly'
                        : 'selection';
                      return (
                        <DraftTakeRow
                          takeNumber={take.takeNumber}
                          isSelected={isSelected}
                          isPlaying={isThisPlaying}
                          leadingIndicator={leadingIndicator}
                          isCanonical={
                            take.id === verseAudio.ownCanonicalTakeId
                          }
                          positionMs={isLoaded ? verseAudio.positionMs : 0}
                          durationMs={
                            isLoaded && verseAudio.durationMs > 0
                              ? verseAudio.durationMs
                              : take.durationMs ?? 0
                          }
                          onPlayPause={() => {
                            void (isThisPlaying
                              ? verseAudio.pausePlayback()
                              : verseAudio.playTake(take));
                          }}
                          onSelect={() => {
                            void verseAudio.selectTake(take.id);
                          }}
                          onDelete={() => handleDeleteTake(take)}
                          onSeek={
                            isSeekable
                              ? ms => {
                                  void verseAudio.seek(ms);
                                }
                              : undefined
                          }
                        />
                      );
                    }}
                  />
                ) : null
              ) : (
                <SectionList
                  testID="record-all-take-list"
                  sections={groupTakesByOwner(verseAudio.allTakes)}
                  keyExtractor={take => take.id}
                  style={styles.takeList}
                  contentContainerStyle={styles.takeListContent}
                  renderSectionHeader={({ section }) => (
                    <TakeGroupHeader displayName={section.title} />
                  )}
                  renderItem={({ item: take }) => {
                    const isLoaded = verseAudio.playingTakeId === take.id;
                    const isThisPlaying =
                      isLoaded && verseAudio.state === 'playing';
                    return (
                      <SharedTakeRow
                        takeNumber={take.takeNumber}
                        isPlaying={isThisPlaying}
                        isCanonical={take.isCanonical}
                        positionMs={isLoaded ? verseAudio.positionMs : 0}
                        durationMs={
                          isLoaded && verseAudio.durationMs > 0
                            ? verseAudio.durationMs
                            : take.durationMs ?? 0
                        }
                        onPlayPause={() => {
                          void (isThisPlaying
                            ? verseAudio.pausePlayback()
                            : verseAudio.playTake(take));
                        }}
                        onDesignateCanonical={() => {
                          void verseAudio.setCanonical(take.id);
                        }}
                      />
                    );
                  }}
                />
              )}

              {takeView === 'mine' ? (
                <TouchableOpacity
                  style={[
                    styles.newTakeButton,
                    (recordDisabled || !verseAudio.canRecordNewTake) &&
                      styles.disabled,
                  ]}
                  onPress={() => {
                    void handleStart();
                  }}
                  disabled={recordDisabled || !verseAudio.canRecordNewTake}
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
              ) : null}
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
  mainTopAligned: {
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.md,
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
  takeViewToggle: {
    flexDirection: 'row',
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.cardBackground,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
    alignSelf: 'center',
    marginTop: theme.spacing.md,
  },
  toggleOption: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  toggleOptionActive: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  toggleLabel: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    fontWeight: theme.typography.weights.medium,
  },
  toggleLabelActive: {
    color: theme.colors.foreground,
  },
  takeList: {
    width: '100%',
    maxHeight: theme.waveform.tallHeight * 3.5,
  },
  takeListContent: {
    gap: theme.spacing.sm,
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
