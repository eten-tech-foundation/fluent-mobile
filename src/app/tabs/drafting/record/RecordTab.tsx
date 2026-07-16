import React, { useEffect, useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
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

interface RecordTabProps {
  bookName: string;
  chapterNumber: number;
  verses: VerseData[];
  selectedVerseNumber: number;
  bibleTextIdForSelectedVerse: number | null;
  onSelectVerse: (verseNumber: number) => void;
  userId: string;
  projectId?: number | null;
  projectUnitId?: number | null;
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
  projectUnitId,
  chapterAssignmentId,
  bookCode,
  tabSwitchGuardRef,
}: RecordTabProps) {
  const navigation = useNavigation();
  const recorder = useVerseRecorder({
    bibleTextId: bibleTextIdForSelectedVerse,
    userId,
    projectId,
    projectUnitId,
    chapterAssignmentId,
    bookCode,
    chapterNumber,
    verseNumber: selectedVerseNumber,
  });

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
  const isRecordingLocked = recorder.status === RecorderStatus.Recording;
  const prevDisabled = !canGoPrev || isRecordingLocked;
  const nextDisabled = !canGoNext || isRecordingLocked;
  const canRecord =
    bibleTextIdForSelectedVerse !== null &&
    typeof projectId === 'number' &&
    Boolean(userId) &&
    recorder.isReady;

  const sourceText = useMemo(
    () => verses.find(v => v.verseNumber === selectedVerseNumber)?.text ?? '',
    [verses, selectedVerseNumber],
  );

  function handlePrev() {
    if (prevDisabled) return;
    recorder.playback.stop();
    withPausedGuard(() => onSelectVerse(verses[verseIndex - 1]!.verseNumber));
  }

  function handleNext() {
    if (nextDisabled) return;
    recorder.playback.stop();
    withPausedGuard(() => onSelectVerse(verses[verseIndex + 1]!.verseNumber));
  }

  async function handleStartPress() {
    if (!canRecord) return;
    if (!(await ensureMicPermission())) return;
    await recorder.start();
  }

  async function handleReRecordPress() {
    if (!canRecord) return;
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

      {!recorder.isReady ? (
        <View style={styles.loadingPlaceholder} testID="record-loading" />
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
            isPlaying={recorder.playback.isPlaying}
            canResume={recorder.canResume}
            isRecovered={recorder.isRecovered}
            recordDisabled={!canRecord}
            onStart={handleStartPress}
            onPause={handlePausePress}
            onResume={handleResumePress}
            onStop={handleStopPress}
            onDiscard={handleDiscardPress}
            onTogglePlayback={() => recorder.playback.toggle()}
            onReRecord={handleReRecordPress}
            onDelete={handleDeletePress}
          />
          {bibleTextIdForSelectedVerse === null ? (
            <Text style={styles.syncHint} testID="record-syncing-hint">
              Source text is still syncing for this verse. Recording will unlock
              when it is ready.
            </Text>
          ) : null}
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
  loadingPlaceholder: {
    minHeight: 232,
  },
  syncHint: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
});
