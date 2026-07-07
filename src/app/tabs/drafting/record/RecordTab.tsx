import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, ToastAndroid, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../../../theme';
import type { VerseData } from '../../../../types/db/types';
import type { TabSwitchGuardRef } from '../../../../types/drafting/types';
import { RecordingControls } from './components/RecordingControls';
import { RecordingWaveform } from './components/RecordingWaveform';
import { SourceTextPanel } from './components/SourceTextPanel';
import { VerseNav } from './components/VerseNav';
import { logger } from '../../../../utils/logger';
import { useRecordTabGuards } from './hooks/useRecordTabGuards';
import { useVerseRecorder } from './hooks/useVerseRecorder';
import { verseReference } from './utils/recordTabUtils';
import { RecorderStatus } from '../../../../types/recording/types';

const log = logger.create('RecordTab');

// Hold the record/review UI back for a short beat on mount and verse switches.
// The recording state is loaded from the local DB (a few ms), so deferring the
// first paint lets it resolve first — the UI settles straight into the correct
// state instead of flashing "idle" and then snapping to "review".
const PRESENTATION_DEFER_MS = 100;

interface RecordTabProps {
  bookName: string;
  chapterNumber: number;
  verses: VerseData[];
  selectedVerseNumber: number;
  bibleTextIdForSelectedVerse: number | null;
  onSelectVerse: (verseNumber: number) => void;
  userId?: string;
  projectId?: number | null;
  chapterAssignmentId?: number | null;
  bookCode?: string | null;
  tabSwitchGuardRef?: TabSwitchGuardRef;
}

export function RecordTab({
  bookName,
  chapterNumber,
  verses,
  selectedVerseNumber,
  bibleTextIdForSelectedVerse,
  onSelectVerse,
  userId,
  projectId,
  chapterAssignmentId,
  bookCode,
  tabSwitchGuardRef,
}: RecordTabProps) {
  const navigation = useNavigation();
  const recorder = useVerseRecorder({
    bibleTextId: bibleTextIdForSelectedVerse,
    userId,
    projectId,
    chapterAssignmentId,
    bookCode,
    chapterNumber,
    verseNumber: selectedVerseNumber,
  });
  const [deferElapsed, setDeferElapsed] = useState(false);

  const { withPausedGuard, withTabSwitchGuard, ensureMicPermission } =
    useRecordTabGuards({
      status: recorder.status,
      permission: recorder.permission,
      requestPermission: recorder.requestPermission,
      discardPaused: recorder.discardPaused,
      navigation: navigation as unknown as Parameters<
        typeof useRecordTabGuards
      >[0]['navigation'],
    });

  useEffect(() => {
    if (!tabSwitchGuardRef) return;
    tabSwitchGuardRef.current = withTabSwitchGuard;
    return () => {
      tabSwitchGuardRef.current = null;
    };
  }, [tabSwitchGuardRef, withTabSwitchGuard]);

  // Present as soon as the recorder has loaded its state, but cap the wait at
  // PRESENTATION_DEFER_MS so a slow/stalled load still surfaces the UI.
  const showContent = recorder.isReady || deferElapsed;

  useEffect(() => {
    if (recorder.isReady) return;
    setDeferElapsed(false);
    const timer = setTimeout(
      () => setDeferElapsed(true),
      PRESENTATION_DEFER_MS,
    );
    return () => clearTimeout(timer);
  }, [recorder.isReady]);

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
  const isRecordingLocked = recorder.status === RecorderStatus.Recording;
  const prevDisabled = !canGoPrev || isRecordingLocked;
  const nextDisabled = !canGoNext || isRecordingLocked;

  const sourceText = useMemo(
    () => verses.find(v => v.verseNumber === selectedVerseNumber)?.text ?? '',
    [verses, selectedVerseNumber],
  );

  function handlePrev() {
    if (prevDisabled) return;
    recorder.stopPlayback();
    withPausedGuard(() => onSelectVerse(verses[verseIndex - 1]!.verseNumber));
  }

  function handleNext() {
    if (nextDisabled) return;
    recorder.stopPlayback();
    withPausedGuard(() => onSelectVerse(verses[verseIndex + 1]!.verseNumber));
  }

  async function handleStartPress() {
    // TEMP: the source verse row hasn't resolved a bible_text id (sync gap /
    // unstable backend contract), which leaves the recorder inert and the record
    // button silently dead. Surface it until the team settles the session-key /
    // bible_text_id approach once sync is stable.
    if (bibleTextIdForSelectedVerse === null) {
      ToastAndroid.show(
        'No bible text id for this verse yet.',
        ToastAndroid.SHORT,
      );
      return;
    }
    if (!(await ensureMicPermission())) return;
    await recorder.start();
  }

  async function handleReRecordPress() {
    if (!(await ensureMicPermission())) return;
    await recorder.reRecord();
  }

  async function handlePausePress() {
    try {
      await recorder.pause();
    } catch (error) {
      log.warn('Failed to pause recording', { error });
      Alert.alert(
        'Could not pause recording',
        'Something went wrong while pausing. Try again, or restart the app if the problem continues.',
      );
    }
  }

  async function handleResumePress() {
    try {
      await recorder.resume();
    } catch (error) {
      log.warn('Failed to resume recording', { error });
      Alert.alert(
        'Could not resume recording',
        'Something went wrong while resuming. Try again, or restart the app if the problem continues.',
      );
    }
  }

  async function handleStopPress() {
    try {
      await recorder.stop();
    } catch (error) {
      log.warn('Failed to stop recording', { error });
      Alert.alert(
        'Could not save recording',
        'Your take could not be saved. Try stopping again, or restart the app if the problem continues.',
      );
    }
  }

  async function handleDiscardPress() {
    try {
      await recorder.discardPaused();
    } catch (error) {
      log.warn('Failed to discard recovered take', { error });
      Alert.alert(
        'Could not discard take',
        'Something went wrong while removing the recovered take. Try again, or restart the app if the problem continues.',
      );
    }
  }

  function handleDeletePress() {
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
      <VerseNav
        reference={currentReference}
        prevDisabled={prevDisabled}
        nextDisabled={nextDisabled}
        onPrev={handlePrev}
        onNext={handleNext}
      />

      {!showContent ? (
        <View style={styles.deferPlaceholder} testID="record-loading" />
      ) : (
        <>
          <RecordingWaveform
            status={recorder.status}
            elapsedMs={recorder.elapsedMs}
          />
          <RecordingControls
            status={recorder.status}
            reference={currentReference}
            elapsedMs={recorder.elapsedMs}
            isPlaying={recorder.isPlaying}
            canResume={recorder.canResume}
            onStart={handleStartPress}
            onPause={handlePausePress}
            onResume={handleResumePress}
            onStop={handleStopPress}
            onDiscard={handleDiscardPress}
            onTogglePlayback={() => recorder.togglePlayback()}
            onReRecord={handleReRecordPress}
            onDelete={handleDeletePress}
          />
        </>
      )}

      <SourceTextPanel sourceText={sourceText} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  // Reserves roughly the waveform + controls height so deferring the first
  // paint does not shift the surrounding layout when the real UI appears.
  deferPlaceholder: {
    minHeight: 232,
  },
});
