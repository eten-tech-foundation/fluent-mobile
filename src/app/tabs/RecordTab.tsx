import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
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
  TriangleAlert,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { useDraftingContext } from '../context/DraftingContext';
import { useVerseAudio } from '../../hooks/useVerseAudio';
import type { VerseAudioState } from '../../hooks/verseAudioReducer';
import { resolveRecordingUnit } from '../../hooks/resolveRecordingUnit';
import { recordingUnitCapturesEqual } from '../../utils/recordingRange';
import { formatTakeSubtitle } from '../../utils/takeSubtitle';
import {
  buildCrossGranularityRows,
  type StitchedTakeRow,
} from '../../utils/crossGranularityRows';
import type { RecordingUnitCapture } from '../../utils/recordingRange';
import { useDraftingUnit } from '../../hooks/useDraftingUnit';
import { useGlobalSyncStatus } from '../../hooks/useGlobalSyncStatus';
import { requestMicPermission } from '../../audio/micPermission';
import { logger } from '../../utils/logger';
import { recordSourceTextHint } from '../../utils/recordSourceTextHint';
import { PlaybackProgressBar } from '../../components/ui/PlaybackProgressBar';
import { DraftTakeRow } from '../../components/ui/DraftTakeRow';
import { SharedTakeRow } from '../../components/ui/SharedTakeRow';
import { TakeGroupHeader } from '../../components/ui/TakeGroupHeader';
import { RecordCircleButton } from '../../components/ui/RecordCircleButton';
import { SourceTextAccordion } from '../../components/ui/SourceTextAccordion';
import {
  useSourceAudioControl,
  useSourceAudioRecordTabIntegration,
} from '../../components/layout/SourceAudioShell';
import { WarningBanner } from '../../components/ui/WarningBanner';
import { StageAdvanceConfirmSheet } from '../../components/ui/StageAdvanceConfirmSheet';
import {
  RECORD_AUDIO_CONFLICT_WARNING,
  RECORD_TAKEN_CHAPTER_WARNING,
} from '../../constants/messages';
import type { PericopeGroupResult } from '../../db/queries';
import { ChapterAssignmentData } from '../../types/db/types';
import { getProjectPericopeSetId } from '../../db/repository';
import { parseRequiredString } from '../../navigation/routeParams';
import { useChapterConflictStatus } from '../../hooks/useChapterConflictStatus';
import { isChapterTakenByOther } from '../../utils/chapterTakenStatus';
import type { Recording, RecordingWithOwner } from '../../types/db/types';
import {
  getStageAdvanceVisibility,
  stageAdvanceConfirmBody,
} from '../../utils/stageAdvancement';
import { confirmStageAdvancement } from '../../services/stageAdvance';
import {
  getBibleTextId,
  getPericopeForVerse,
  getRecordedVerseNumbers,
} from '../../db/queries';

const log = logger.create('RecordTab');

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
  userId: number | null;
  onCaptureActiveChange?: (active: boolean) => void;
  onChapterClaimed?: () => void;
};

/**
 * Record tab — draft capture / review for the selected drafting verse.
 * Built on useVerseAudio (#97). Multi-take Review list is #71 — takes are
 * ordered by take_number ASC; exclusive playback is enforced by the single
 * playback engine inside useVerseAudio (tracked via playingTakeId).
 * Cross-account All Takes toggle + canonical designation is #279.
 * Take list and Source Text render inline (no independent scroll
 * containers) inside a single page-level ScrollView beneath the pinned
 * verse nav bar — see #404.
 */
export function RecordTab({
  chapterData,
  userId,
  onCaptureActiveChange,
  onChapterClaimed,
}: RecordTabProps) {
  const router = useRouter();
  const rawParams = useLocalSearchParams<{ chapterName?: string }>();
  const chapterName = parseRequiredString(rawParams.chapterName, 'chapterName');
  const { verses, selectedVerse, setSelectedVerse, refreshRecordedVerses } =
    useDraftingContext();
  const [bibleTextId, setBibleTextId] = useState<number | null>(null);
  /** Verse `selectedVerse` that `bibleTextId` was resolved for (null while stale). */
  const [bibleTextVerse, setBibleTextVerse] = useState<number | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [takeView, setTakeView] = useState<'mine' | 'all'>('mine');
  const [hasChapterRecording, setHasChapterRecording] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { draftingUnit } = useDraftingUnit();
  const [recordingUnit, setRecordingUnit] =
    useState<RecordingUnitCapture | null>(null);

  const captureBibleTextId = useMemo(() => {
    if (bibleTextId === null || bibleTextVerse !== selectedVerse) {
      return null;
    }
    return bibleTextId;
  }, [bibleTextId, bibleTextVerse, selectedVerse]);

  const recordingCaptureReady = useMemo(() => {
    if (captureBibleTextId === null) {
      return false;
    }
    if (draftingUnit !== 'pericope') {
      return true;
    }
    return (
      recordingUnit !== null &&
      recordingUnit.coveredViews.some(
        view =>
          view.bibleTextId === captureBibleTextId &&
          view.chapterNumber === chapterData.chapterNumber &&
          view.verseNumber === selectedVerse,
      )
    );
  }, [
    captureBibleTextId,
    chapterData.chapterNumber,
    draftingUnit,
    recordingUnit,
    selectedVerse,
  ]);

  const activeRecordingUnit =
    draftingUnit === 'pericope' && recordingCaptureReady ? recordingUnit : null;

  const verseAudio = useVerseAudio({
    bibleTextId: captureBibleTextId,
    chapterAssignmentId: chapterData.id,
    userId,
    chapterClaim: {
      bibleId: chapterData.bibleId,
      bookId: chapterData.bookId,
      chapterNumber: chapterData.chapterNumber,
      assignedUserId: chapterData.assignedUserId,
    },
    onChapterClaimed,
    chapterNumber: chapterData.chapterNumber,
    verseNumber: selectedVerse,
    draftingUnit,
    recordingUnit: activeRecordingUnit,
  });
  /**
   * Latest-value ref synced during render so async `resolveRecordingUnit`
   * settlements read current audio state without listing `verseAudio.state` in
   * effect deps (that re-ran resolve and looped REHYDRATE — #411). Do not move
   * to useLayoutEffect: the .then can settle before layout effects run.
   */
  const verseAudioStateRef = useRef<VerseAudioState>(verseAudio.state);
  verseAudioStateRef.current = verseAudio.state;
  const verseIndex = verses.findIndex(v => v.verseNumber === selectedVerse);
  const prevDisabled = verseIndex <= 0;
  const nextDisabled = verseIndex < 0 || verseIndex >= verses.length - 1;
  const selected = verses.find(v => v.verseNumber === selectedVerse);

  const resolveBibleTextId = useCallback(async () => {
    return getBibleTextId(
      chapterData.bibleId,
      chapterData.bookId,
      chapterData.chapterNumber,
      selectedVerse,
    );
  }, [
    chapterData.bibleId,
    chapterData.bookId,
    chapterData.chapterNumber,
    selectedVerse,
  ]);

  const [pericopeSetId, setPericopeSetId] = useState<number | null>(null);
  const [activePericope, setActivePericope] =
    useState<PericopeGroupResult | null>(null);
  const pericopeRequestIdRef = useRef(0);

  const pericopeVerses = useMemo(
    () => activePericope?.verses ?? [],
    [activePericope],
  );
  const firstPericopeVerse = pericopeVerses[0] ?? null;
  const lastPericopeVerse = pericopeVerses[pericopeVerses.length - 1] ?? null;
  const pericopeSpansChapters =
    firstPericopeVerse !== null &&
    lastPericopeVerse !== null &&
    firstPericopeVerse.chapterNumber !== lastPericopeVerse.chapterNumber;
  const pericopeRange =
    firstPericopeVerse && lastPericopeVerse
      ? pericopeSpansChapters
        ? `${firstPericopeVerse.chapterNumber}:${firstPericopeVerse.verseNumber}–${lastPericopeVerse.chapterNumber}:${lastPericopeVerse.verseNumber}`
        : `${firstPericopeVerse.verseNumber}–${lastPericopeVerse.verseNumber}`
      : null;
  // Falls back to the verse reference silently whenever no pericope set/data
  // is resolved (e.g. project has no pericope set configured) — see #409.
  // Cross-chapter pericopes (e.g. Genesis 1→2) render with explicit chapter
  // numbers on both endpoints rather than the "chapterName:range" shorthand,
  // since a bare verse range would be ambiguous across chapters.
  const reference =
    draftingUnit === 'pericope' && pericopeRange
      ? pericopeSpansChapters
        ? `${chapterData.bookName} ${pericopeRange}`
        : `${chapterName}:${pericopeRange}`
      : `${chapterName}:${selectedVerse}`;
  const referenceSubtitle =
    draftingUnit === 'pericope' && pericopeRange
      ? activePericope?.pericopeTitle ?? null
      : null;

  /**
   * My Takes rows. Pericope view collapses verse takes into one stitched row so
   * the draft is still playable when display mode and capture disagree (#411).
   * Falls back to the capture unit's covered verses when #409 pericope data has
   * not resolved yet.
   */
  const displayRows = useMemo(
    () =>
      buildCrossGranularityRows({
        draftingUnit,
        pericopeVerses: pericopeVerses.length
          ? pericopeVerses.map(verse => ({
              chapterNumber: verse.chapterNumber,
              verseNumber: verse.verseNumber,
            }))
          : activeRecordingUnit?.coveredViews.map(view => ({
              chapterNumber: view.chapterNumber,
              verseNumber: view.verseNumber,
            })) ?? [],
        takes: verseAudio.takes,
      }),
    [
      draftingUnit,
      pericopeVerses,
      activeRecordingUnit?.coveredViews,
      verseAudio.takes,
    ],
  );

  const hasTake = displayRows.length > 0;
  const hasAnyTake = hasTake || verseAudio.allTakes.length > 0;
  const activeViewHasTakes = takeView === 'mine' ? hasTake : hasAnyTake;

  /** Shared generation so sync-triggered and verse-change lookups ignore stale IDs. */
  const bibleTextRequestIdRef = useRef(0);

  const refreshBibleTextId = useCallback(() => {
    const requestId = ++bibleTextRequestIdRef.current;
    const verse = selectedVerse;
    void resolveBibleTextId().then(id => {
      if (requestId === bibleTextRequestIdRef.current) {
        setBibleTextId(id);
        setBibleTextVerse(verse);
      }
    });
  }, [resolveBibleTextId, selectedVerse]);

  const isSyncing = useGlobalSyncStatus(refreshBibleTextId);

  useEffect(() => {
    if (chapterData.projectId === null) {
      setPericopeSetId(null);
      return;
    }
    let cancelled = false;
    void getProjectPericopeSetId(chapterData.projectId).then(id => {
      if (!cancelled) setPericopeSetId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [chapterData.projectId]);

  useEffect(() => {
    const requestId = ++pericopeRequestIdRef.current;
    if (draftingUnit !== 'pericope' || pericopeSetId === null) {
      setActivePericope(null);
      return;
    }
    setActivePericope(null);
    void getPericopeForVerse(
      chapterData.bookId,
      chapterData.chapterNumber,
      selectedVerse,
      pericopeSetId,
    ).then(result => {
      if (requestId === pericopeRequestIdRef.current) {
        setActivePericope(result);
      }
    });
  }, [
    draftingUnit,
    pericopeSetId,
    chapterData.bookId,
    chapterData.chapterNumber,
    selectedVerse,
  ]);

  // verseAudio.state is read via ref — listing it in deps caused a REHYDRATE
  // idle↔recorded loop when switching to pericope (#411 device QA).
  useEffect(() => {
    const audioState = verseAudioStateRef.current;
    if (
      audioState === 'recording' ||
      audioState === 'paused' ||
      // Re-resolving during review would drop the capture unit mid-take, and
      // the take load keys off it (#411). Verse changes tear playback down
      // first, so this effect still re-runs with a fresh verse.
      audioState === 'playing'
    ) {
      return;
    }
    if (captureBibleTextId === null) {
      setRecordingUnit(null);
      return;
    }
    let cancelled = false;
    void resolveRecordingUnit({
      draftingUnit,
      projectId: chapterData.projectId ?? null,
      bibleId: chapterData.bibleId,
      bookId: chapterData.bookId,
      chapterNumber: chapterData.chapterNumber,
      verseNumber: selectedVerse,
      selectedBibleTextId: captureBibleTextId,
    }).then(unit => {
      if (cancelled) {
        return;
      }
      const settledState = verseAudioStateRef.current;
      // Do not discard the first resolved unit just because review playback
      // already started — only block while capture is active (#411).
      if (settledState === 'recording' || settledState === 'paused') {
        return;
      }
      // Keep the prior unit while async resolve runs, and skip setState when
      // content is unchanged — nulling first made loadTakesFn flip and loop
      // with REHYDRATE (#411 device QA).
      setRecordingUnit(prev =>
        recordingUnitCapturesEqual(prev, unit) ? prev : unit,
      );
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verseAudio.state via ref
  }, [
    captureBibleTextId,
    chapterData.bibleId,
    chapterData.bookId,
    chapterData.chapterNumber,
    chapterData.projectId,
    draftingUnit,
    selectedVerse,
  ]);

  useEffect(() => {
    setTakeView('mine');
  }, [captureBibleTextId]);

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
    const requestId = ++bibleTextRequestIdRef.current;
    const verse = selectedVerse;
    setBibleTextId(null);
    setBibleTextVerse(null);
    void resolveBibleTextId().then(id => {
      if (requestId === bibleTextRequestIdRef.current) {
        setBibleTextId(id);
        setBibleTextVerse(verse);
      }
    });
    return () => {
      bibleTextRequestIdRef.current += 1;
    };
  }, [resolveBibleTextId, selectedVerse, verses.length]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recorded = await getRecordedVerseNumbers(
        chapterData.bibleId,
        chapterData.bookId,
        chapterData.chapterNumber,
      );
      if (!cancelled) {
        setHasChapterRecording(recorded.size > 0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    chapterData.bibleId,
    chapterData.bookId,
    chapterData.chapterNumber,
    verseAudio.state,
  ]);

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

  const recordDisabled = captureBibleTextId === null;
  const syncingMessage = recordSourceTextHint(captureBibleTextId, isSyncing);

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
    bibleTextRequestIdRef.current += 1;
    setBibleTextId(null);
    setBibleTextVerse(null);
    setRecordingUnit(null);
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

  const sourceAudioControl = useSourceAudioControl();
  const stopSourceAudioRef = useRef(
    sourceAudioControl?.stop ?? (async () => {}),
  );

  useEffect(() => {
    stopSourceAudioRef.current = sourceAudioControl?.stop ?? (async () => {});
  }, [sourceAudioControl?.stop]);

  useSourceAudioRecordTabIntegration({
    sourceEnabled: showSourceAudio,
    verseAudioState: verseAudio.state,
    pauseDraftPlayback: verseAudio.pausePlayback,
  });

  async function handleStart() {
    if (!(await ensureMic())) return;
    setElapsedMs(0);
    if (sourceAudioControl && sourceAudioControl.status !== 'idle') {
      await stopSourceAudioRef.current();
    }
    await verseAudio.start();
  }

  async function handleStop() {
    await verseAudio.stop();
  }

  async function handlePlayTake(take: Recording) {
    if (sourceAudioControl && sourceAudioControl.status !== 'idle') {
      await stopSourceAudioRef.current();
    }
    await verseAudio.playTake(take);
  }

  async function handlePlayStitched(row: StitchedTakeRow) {
    if (sourceAudioControl && sourceAudioControl.status !== 'idle') {
      await stopSourceAudioRef.current();
    }
    await verseAudio.playStitched(row);
  }
  const currentUserId = userId;
  const isTaken = useMemo(
    () => isChapterTakenByOther(chapterData, currentUserId),
    [chapterData, currentUserId],
  );
  const { hasConflict } = useChapterConflictStatus(chapterData.id);
  const chapterHasRecording = hasChapterRecording || hasTake;
  const stageAdvance = useMemo(
    () =>
      getStageAdvanceVisibility({
        chapterData,
        currentUserId,
        hasChapterRecording: chapterHasRecording,
        hasConflict,
      }),
    [chapterData, currentUserId, chapterHasRecording, hasConflict],
  );

  const handleOpenAdvanceSheet = useCallback(() => {
    if (
      !stageAdvance.visible ||
      stageAdvance.disabled ||
      !stageAdvance.destination
    ) {
      return;
    }
    setConfirmVisible(true);
  }, [stageAdvance]);

  const handleCancelAdvance = useCallback(() => {
    if (submitting) return;
    setConfirmVisible(false);
  }, [submitting]);

  const handleConfirmAdvance = useCallback(async () => {
    if (
      !confirmVisible ||
      !stageAdvance.visible ||
      stageAdvance.disabled ||
      !stageAdvance.destination ||
      submitting
    ) {
      return;
    }
    setSubmitting(true);
    try {
      await confirmStageAdvancement({
        chapterAssignmentId: chapterData.id,
        destination: stageAdvance.destination,
      });
      setConfirmVisible(false);
      if (router.canGoBack()) {
        router.back();
      }
    } catch (error) {
      log.error('Stage advancement failed', { error });
      Alert.alert(
        'Could not advance stage',
        'Something went wrong updating this chapter. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    chapterData.id,
    confirmVisible,
    router,
    stageAdvance.destination,
    stageAdvance.disabled,
    stageAdvance.visible,
    submitting,
  ]);

  return (
    <View style={styles.container} testID="record-tab">
      {isTaken ? (
        <WarningBanner
          testID="record-taken-warning"
          message={RECORD_TAKEN_CHAPTER_WARNING}
        />
      ) : null}
      {hasConflict ? (
        <WarningBanner
          testID="record-conflict-warning"
          variant="amber"
          icon={TriangleAlert}
          message={RECORD_AUDIO_CONFLICT_WARNING}
        />
      ) : null}
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
        <View style={styles.referenceColumn}>
          <Text style={styles.reference} testID="record-verse-reference">
            {reference}
          </Text>
          {referenceSubtitle ? (
            <Text
              style={styles.referenceSubtitle}
              numberOfLines={1}
              testID="record-verse-reference-subtitle"
            >
              {referenceSubtitle}
            </Text>
          ) : null}
        </View>
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

      <ScrollView
        style={styles.main}
        contentContainerStyle={[
          styles.mainContent,
          !showReview && styles.mainContentCentered,
        ]}
      >
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
                displayRows.length > 0 ? (
                  <View style={styles.takeList} testID="record-take-list">
                    {displayRows.map(row => {
                      if (row.kind === 'stitched') {
                        const isThisPlaying =
                          verseAudio.playingTakeId === row.id &&
                          verseAudio.state === 'playing';
                        const showStitchedProgress =
                          verseAudio.playingTakeId === row.id &&
                          (verseAudio.state === 'playing' ||
                            verseAudio.playbackStatus === 'paused');
                        return (
                          <View key={row.id} style={styles.takeItemSpacing}>
                            <DraftTakeRow
                              takeNumber={row.takeNumber}
                              label={formatTakeSubtitle({
                                takeNumber: row.takeNumber,
                                granularity: 'stitched',
                                startChapter: row.startChapter,
                                startVerse: row.startVerse,
                                endChapter: row.endChapter,
                                endVerse: row.endVerse,
                              })}
                              isSelected={false}
                              isPlaying={isThisPlaying}
                              leadingIndicator="none"
                              // Progress is segment-local while playing:
                              // continuous scrub across segments is out of
                              // scope for #411.
                              positionMs={
                                showStitchedProgress ? verseAudio.positionMs : 0
                              }
                              durationMs={
                                showStitchedProgress &&
                                verseAudio.durationMs > 0
                                  ? verseAudio.durationMs
                                  : row.durationMs ?? 0
                              }
                              onPlayPause={() => {
                                void (isThisPlaying
                                  ? verseAudio.pausePlayback()
                                  : handlePlayStitched(row));
                              }}
                            />
                          </View>
                        );
                      }
                      const take = row.take;
                      const isSelected =
                        take.id === verseAudio.selectedTake?.id;
                      const isThisPlaying =
                        verseAudio.playingTakeId === take.id &&
                        verseAudio.state === 'playing';
                      const showLiveProgress =
                        verseAudio.playingTakeId === take.id ||
                        (verseAudio.loadedTakeId === take.id &&
                          verseAudio.playbackStatus === 'paused');
                      const isSeekable =
                        verseAudio.loadedTakeId === take.id ||
                        (verseAudio.loadedTakeId === null && isSelected);
                      const leadingIndicator = verseAudio.hasMultipleRecorders
                        ? 'canonicalReadOnly'
                        : 'selection';
                      return (
                        <View key={take.id} style={styles.takeItemSpacing}>
                          <DraftTakeRow
                            takeNumber={take.takeNumber}
                            label={formatTakeSubtitle(take)}
                            isSelected={isSelected}
                            isPlaying={isThisPlaying}
                            leadingIndicator={leadingIndicator}
                            isCanonical={
                              take.id === verseAudio.ownCanonicalTakeId
                            }
                            positionMs={
                              showLiveProgress ? verseAudio.positionMs : 0
                            }
                            durationMs={
                              showLiveProgress && verseAudio.durationMs > 0
                                ? verseAudio.durationMs
                                : take.durationMs ?? 0
                            }
                            onPlayPause={() => {
                              void (isThisPlaying
                                ? verseAudio.pausePlayback()
                                : handlePlayTake(take));
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
                        </View>
                      );
                    })}
                  </View>
                ) : null
              ) : (
                <View style={styles.takeList} testID="record-all-take-list">
                  {groupTakesByOwner(verseAudio.allTakes).map(section => (
                    <View
                      key={section.ownerId ?? 'unassigned'}
                      style={styles.takeItemSpacing}
                    >
                      <TakeGroupHeader displayName={section.title} />
                      {section.data.map(take => {
                        const isThisPlaying =
                          verseAudio.playingTakeId === take.id &&
                          verseAudio.state === 'playing';
                        const showLiveProgress =
                          verseAudio.playingTakeId === take.id ||
                          (verseAudio.loadedTakeId === take.id &&
                            verseAudio.playbackStatus === 'paused');
                        return (
                          <View key={take.id} style={styles.takeItemSpacing}>
                            <SharedTakeRow
                              takeNumber={take.takeNumber}
                              label={formatTakeSubtitle(take)}
                              isPlaying={isThisPlaying}
                              isCanonical={take.isCanonical}
                              positionMs={
                                showLiveProgress ? verseAudio.positionMs : 0
                              }
                              durationMs={
                                showLiveProgress && verseAudio.durationMs > 0
                                  ? verseAudio.durationMs
                                  : take.durationMs ?? 0
                              }
                              onPlayPause={() => {
                                void (isThisPlaying
                                  ? verseAudio.pausePlayback()
                                  : handlePlayTake(take));
                              }}
                              onDesignateCanonical={() => {
                                void verseAudio.setCanonical(take.id);
                              }}
                            />
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
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

        {stageAdvance.visible && stageAdvance.destination && !showCapture ? (
          <TouchableOpacity
            style={[
              styles.stageAdvanceButton,
              stageAdvance.disabled && styles.disabled,
            ]}
            onPress={handleOpenAdvanceSheet}
            disabled={stageAdvance.disabled}
            accessibilityRole="button"
            accessibilityLabel={stageAdvance.destination.buttonLabel}
            accessibilityState={{ disabled: stageAdvance.disabled }}
            testID="stage-advance-button"
          >
            <Text style={styles.stageAdvanceLabel}>
              {stageAdvance.destination.buttonLabel}
            </Text>
          </TouchableOpacity>
        ) : null}

        <SourceTextAccordion
          expanded={sourceExpanded}
          onToggle={() => setSourceExpanded(v => !v)}
          text={selected?.text}
        />
      </ScrollView>

      {confirmVisible && stageAdvance.destination ? (
        <StageAdvanceConfirmSheet
          visible={confirmVisible}
          chapterName={chapterName}
          bodyText={stageAdvanceConfirmBody(
            chapterName,
            stageAdvance.destination.destinationLabel,
          )}
          submitting={submitting}
          onCancel={handleCancelAdvance}
          onConfirm={() => {
            void handleConfirmAdvance();
          }}
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
  },
  mainContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  mainContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 0,
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
  },
  takeItemSpacing: {
    marginBottom: theme.spacing.sm,
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
  stageAdvanceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 48,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  stageAdvanceLabel: {
    color: theme.colors.primaryForeground,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  referenceColumn: {
    flex: 1,
    alignItems: 'center',
  },
  referenceSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
});
