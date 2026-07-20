import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';

interface UploadProgressBarProps {
  uploadedChapters: number;
  totalChapters: number;
  frozen?: boolean;
}

export function UploadProgressBar({
  uploadedChapters,
  totalChapters,
  frozen = false,
}: UploadProgressBarProps) {
  const ratio = totalChapters > 0 ? uploadedChapters / totalChapters : 0;
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
});
