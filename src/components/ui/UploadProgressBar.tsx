import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';
import type { UploadTakeProgress } from '../../services/syncEvents';

interface UploadProgressBarProps {
  uploadedChapters: number;
  totalChapters: number;
  frozen?: boolean;
  /** Take progress inside the chapter uploading now (#886). */
  currentChapter?: UploadTakeProgress | null;
}

/** "Chapter 3: 2 of 10 takes uploaded" (+ " · 1 failed" when any failed). */
export function formatCurrentChapterTakes(current: UploadTakeProgress): string {
  const failed =
    current.failedTakes > 0 ? ` · ${current.failedTakes} failed` : '';
  return `Chapter ${current.chapterNumber}: ${current.completedTakes} of ${current.totalTakes} takes uploaded${failed}`;
}

export function UploadProgressBar({
  uploadedChapters,
  totalChapters,
  frozen = false,
  currentChapter = null,
}: UploadProgressBarProps) {
  // Fractional credit for the chapter in flight so a long chapter moves the
  // bar before it completes (#886). Chapter counts stay the headline and
  // only uploaded takes count — a failed take keeps its chapter pending.
  const takeFraction =
    currentChapter && currentChapter.totalTakes > 0
      ? Math.min(1, currentChapter.completedTakes / currentChapter.totalTakes)
      : 0;
  const ratio =
    totalChapters > 0
      ? Math.min(1, (uploadedChapters + takeFraction) / totalChapters)
      : 0;
  const percent = Math.round(ratio * 100);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>Uploading</Text>
        <Text style={styles.percent}>{percent}%</Text>
      </View>

      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.min(100, Math.max(0, percent))}%` },
            frozen && styles.fillFrozen,
          ]}
        />
      </View>

      <Text style={styles.chapterCount}>
        {uploadedChapters} of {totalChapters} chapters uploaded
      </Text>
      {currentChapter ? (
        <Text style={styles.takeCount} testID="upload-progress-current-chapter">
          {formatCurrentChapterTakes(currentChapter)}
        </Text>
      ) : null}
    </View>
  );
}

const BAR_HEIGHT = 8;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  percent: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
  },
  track: {
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: theme.colors.primary,
  },
  fillFrozen: {
    opacity: 0.7,
  },
  chapterCount: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  takeCount: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
