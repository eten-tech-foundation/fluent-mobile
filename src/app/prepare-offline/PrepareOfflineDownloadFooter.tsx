import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CircleCheck, Download } from 'lucide-react-native';
import { formatByteSize } from '../../utils/formatByteSize';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

interface PrepareOfflineDownloadFooterProps {
  totalBytes: number;
  pendingBytes: number;
  canDownload: boolean;
  downloadButtonLabel: string;
  downloadStarted: boolean;
  onDownload: () => void;
}

export function PrepareOfflineDownloadFooter({
  totalBytes,
  pendingBytes,
  canDownload,
  downloadButtonLabel,
  downloadStarted,
  onDownload,
}: PrepareOfflineDownloadFooterProps) {
  const downloadComplete = downloadStarted && pendingBytes === 0;
  const downloadInProgress = downloadStarted && pendingBytes > 0;

  return (
    <View style={styles.footer} testID="prepare-offline-download-footer">
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total download</Text>
        <Text style={styles.totalValue} testID="prepare-offline-total-bytes">
          {formatByteSize(totalBytes)}
        </Text>
      </View>

      {downloadComplete ? (
        <View
          style={styles.completeRow}
          testID="prepare-offline-download-complete"
        >
          <CircleCheck
            size={iconSizes.chapterSync}
            color={theme.colors.syncSynced}
            strokeWidth={listIconStrokeWidth}
          />
          <Text style={styles.completeText}>Download complete</Text>
        </View>
      ) : downloadInProgress ? (
        <Text
          style={styles.startedHint}
          testID="prepare-offline-download-started"
        >
          Download started. Pause, resume, and cancel controls are coming soon.
        </Text>
      ) : (
        <TouchableOpacity
          style={[
            styles.downloadButton,
            !canDownload && styles.downloadButtonDisabled,
          ]}
          onPress={onDownload}
          disabled={!canDownload}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDownload }}
          testID="prepare-offline-download-button"
        >
          <Download
            size={iconSizes.chapterSync}
            color={
              canDownload
                ? theme.colors.primaryForeground
                : theme.colors.mutedForeground
            }
            strokeWidth={listIconStrokeWidth}
          />
          <Text
            style={[
              styles.downloadButtonLabel,
              !canDownload && styles.downloadButtonLabelDisabled,
            ]}
          >
            {downloadButtonLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.background,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  totalValue: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  downloadButtonDisabled: {
    opacity: 0.5,
  },
  downloadButtonLabel: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primaryForeground,
  },
  downloadButtonLabelDisabled: {
    color: theme.colors.mutedForeground,
  },
  startedHint: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: theme.spacing.sm,
  },
  completeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  completeText: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.syncSynced,
  },
});
