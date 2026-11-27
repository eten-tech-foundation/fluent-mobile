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

/**
 * Row label for a verse take or a pericope range (#410), with the take number
 * appended when it is not the first take of that verse so held takes of the
 * same reference stay distinguishable (#855).
 */
export function formatHeldRecordingLabel(recording: HeldRecording): string {
  const range = formatHeldRecordingRange(recording);
  return recording.takeNumber > 1
    ? `${range} · Take ${recording.takeNumber}`
    : range;
}

function formatHeldRecordingRange(recording: HeldRecording): string {
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
 * Held work on the Sync page (#855): says why takes were kept on the device
 * (the account was removed from the project, is not the chapter's drafter, or
 * the server did not accept them), how many, and lets the user play each one.
 * Rows disappear once they upload (the query only returns `held` takes).
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

  // A row that uploads or is released leaves the list mid-playback: stop the
  // audio so it does not keep playing with no row to control it.
  useEffect(() => {
    if (playingId !== null && !recordings.some(r => r.id === playingId)) {
      void playback.pause();
      setPlayingId(null);
    }
  }, [recordings, playingId, playback]);

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

  const removedProjects = groups.filter(group =>
    group.chapters.some(chapter =>
      chapter.recordings.some(record => record.reason === 'removed'),
    ),
  );
  const unassignedCount = recordings.filter(
    record => record.reason === 'unassigned',
  ).length;
  const deniedCount = recordings.filter(
    record => record.reason === 'denied',
  ).length;
  const waitingCount = recordings.filter(
    record => record.reason === 'waiting',
  ).length;
  const recordingCount = recordings.length;
  const removedFrom =
    removedProjects.length === 0
      ? null
      : removedProjects.length === 1
      ? `You were removed from ${removedProjects[0]!.projectName}.`
      : `You were removed from ${removedProjects.length} projects.`;
  const notSent = `${recordingCount} ${
    recordingCount === 1 ? 'recording was' : 'recordings were'
  } not sent.`;
  // Added back to the project, but the chapter has no drafter or another one
  // (#855): only a reassignment lets these upload.
  const unassigned =
    unassignedCount === 0
      ? null
      : recordingCount === 1
      ? 'Its chapter is not assigned to you.'
      : unassignedCount === 1
      ? '1 is in a chapter not assigned to you.'
      : `${unassignedCount} are in chapters not assigned to you.`;
  // Member and drafter as far as this device knows, but Fluent still denied
  // the upload; it is retried once the chapter's assignment changes.
  const denied =
    deniedCount === 0
      ? null
      : recordingCount === 1
      ? 'Fluent did not accept it for its chapter.'
      : deniedCount === 1
      ? 'Fluent did not accept 1 for its chapter.'
      : `Fluent did not accept ${deniedCount} for their chapters.`;
  // A claim sent from this device has not landed yet, or nothing stands in the
  // way: these leave the list on their own.
  const waiting =
    waitingCount === 0
      ? null
      : recordingCount === 1
      ? 'It will upload on the next sync.'
      : waitingCount === 1
      ? '1 will upload on the next sync.'
      : `${waitingCount} will upload on the next sync.`;
  const message = [removedFrom, notSent, unassigned, denied, waiting]
    .filter(Boolean)
    .join(' ');
  const help = [
    removedFrom
      ? 'Contact your project manager if the removal seems wrong.'
      : null,
    unassigned
      ? 'Ask your project manager to assign the chapter to you. Then these recordings will upload on their own.'
      : null,
    denied
      ? 'Ask your project manager to check your chapter assignment.'
      : null,
    'These recordings stay on this device.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View style={styles.section} testID="sync-held-section">
      <WarningBanner
        variant="amber"
        icon={CircleAlert}
        message={message}
        testID="sync-held-banner"
      />
      <Text style={styles.help} testID="sync-held-help">
        {help}
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
                    takeNumber={recording.takeNumber}
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
