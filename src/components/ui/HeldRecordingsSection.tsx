import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { theme } from '../../theme';
import { usePlaybackEngine } from '../../hooks/usePlaybackEngine';
import type { HeldRecording } from '../../db/repositories/heldRecordingsRepository';
import { WarningBanner } from './WarningBanner';
import { DraftTakeRow } from './DraftTakeRow';

export type HeldRecordingChapterGroup = {
  key: string;
  bookName: string;
  chapterNumber: number;
  recordings: HeldRecording[];
};

export type HeldRecordingProjectGroup = {
  projectId: number;
  projectName: string;
  chapters: HeldRecordingChapterGroup[];
};

/** Group held takes by project, then book/chapter, preserving query order. */
export function groupHeldRecordings(
  recordings: readonly HeldRecording[],
): HeldRecordingProjectGroup[] {
  const projects = new Map<number, HeldRecordingProjectGroup>();
  for (const recording of recordings) {
    let project = projects.get(recording.projectId);
    if (!project) {
      project = {
        projectId: recording.projectId,
        projectName: recording.projectName,
        chapters: [],
      };
      projects.set(recording.projectId, project);
    }
    let chapter = project.chapters.find(
      group =>
        group.bookName === recording.bookName &&
        group.chapterNumber === recording.chapterNumber,
    );
    if (!chapter) {
      chapter = {
        key: `${recording.projectId}:${recording.bookId}:${recording.chapterNumber}`,
        bookName: recording.bookName,
        chapterNumber: recording.chapterNumber,
        recordings: [],
      };
      project.chapters.push(chapter);
    }
    chapter.recordings.push(recording);
  }
  return [...projects.values()];
}

/** Row label for a verse take or a pericope range (#410). */
export function formatHeldRecordingLabel(recording: HeldRecording): string {
  if (recording.granularity === 'pericope') {
    const startChapter = recording.startChapter ?? recording.chapterNumber;
    const startVerse = recording.startVerse ?? recording.verseNumber;
    const endChapter = recording.endChapter ?? startChapter;
    const endVerse = recording.endVerse ?? startVerse;
    if (startChapter === endChapter) {
      return startVerse === endVerse
        ? `v. ${startVerse}`
        : `vv. ${startVerse}–${endVerse}`;
    }
    return `${startChapter}:${startVerse}–${endChapter}:${endVerse}`;
  }
  return `v. ${recording.verseNumber}`;
}

type HeldRecordingsSectionProps = {
  recordings: HeldRecording[];
};

/**
 * Held work on the Sync page (#855): says the account was removed from the
 * project, how many takes were kept on the device, and lets the user play each
 * one. Rows disappear once they upload (the query only returns `held` takes).
 */
export function HeldRecordingsSection({
  recordings,
}: HeldRecordingsSectionProps) {
  const playback = usePlaybackEngine();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const groups = useMemo(() => groupHeldRecordings(recordings), [recordings]);

  useEffect(() => {
    if (playback.status !== 'playing') {
      setPlayingId(null);
    }
  }, [playback.status]);

  const handlePlayPause = useCallback(
    async (recording: HeldRecording) => {
      setPlaybackError(null);
      if (playingId === recording.id) {
        await playback.pause();
        setPlayingId(null);
        return;
      }
      try {
        await playback.play(recording.localFilePath);
        setPlayingId(recording.id);
      } catch {
        setPlayingId(null);
        setPlaybackError(
          'Could not play this recording. The file may be missing from this device.',
        );
      }
    },
    [playback, playingId],
  );

  if (recordings.length === 0) {
    return null;
  }

  const projectCount = groups.length;
  const recordingCount = recordings.length;
  const removedFrom =
    projectCount === 1
      ? `You were removed from ${groups[0]!.projectName}.`
      : `You were removed from ${projectCount} projects.`;
  const notSent = `${recordingCount} ${
    recordingCount === 1 ? 'recording was' : 'recordings were'
  } not sent.`;

  return (
    <View style={styles.section} testID="sync-held-section">
      <WarningBanner
        variant="amber"
        icon={CircleAlert}
        message={`${removedFrom} ${notSent}`}
        testID="sync-held-banner"
      />
      <Text style={styles.help} testID="sync-held-help">
        Contact your project manager if the removal seems wrong. These
        recordings stay on this device.
      </Text>
      {playbackError ? (
        <Text style={styles.error} testID="sync-held-playback-error">
          {playbackError}
        </Text>
      ) : null}
      {groups.map(project => (
        <View
          key={project.projectId}
          style={styles.project}
          testID={`sync-held-project-${project.projectId}`}
        >
          <Text style={styles.projectName}>{project.projectName}</Text>
          {project.chapters.map(chapter => (
            <View key={chapter.key} style={styles.chapter}>
              <Text
                style={styles.chapterName}
                testID={`sync-held-chapter-${chapter.key}`}
              >
                {chapter.bookName} {chapter.chapterNumber}
              </Text>
              {chapter.recordings.map(recording => {
                const isCurrent = playingId === recording.id;
                const isPlaying = isCurrent && playback.status === 'playing';
                return (
                  <DraftTakeRow
                    key={recording.id}
                    takeId={recording.id}
                    takeNumber={1}
                    label={formatHeldRecordingLabel(recording)}
                    positionMs={isCurrent ? playback.positionMs : 0}
                    durationMs={
                      isCurrent && playback.durationMs > 0
                        ? playback.durationMs
                        : recording.durationMs ?? 0
                    }
                    isPlaying={isPlaying}
                    isSelected={false}
                    leadingIndicator="none"
                    onPlayPause={() => {
                      void handlePlayPause(recording);
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.cardBackground,
  },
  help: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  error: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.destructive,
  },
  project: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  projectName: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  chapter: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  chapterName: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.mutedForeground,
  },
});
