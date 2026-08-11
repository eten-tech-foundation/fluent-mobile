import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  CircleCheck,
  Download,
  Pause,
  Play,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { formatByteSize } from '../../utils/formatByteSize';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import type { PrepareOfflineDownloadSession } from '../../hooks/usePrepareOfflineDownload';

interface PrepareOfflineDownloadFooterProps {
  totalBytes: number;
  canDownload: boolean;
  downloadButtonLabel: string;
  session: PrepareOfflineDownloadSession;
  busy?: boolean;
  onDownload: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function PrepareOfflineDownloadFooter({
  totalBytes,
  canDownload,
  downloadButtonLabel,
  session,
  busy = false,
  onDownload,
  onPause,
  onResume,
  onCancel,
}: PrepareOfflineDownloadFooterProps) {
  const disabled = busy;

  return (
    <View style={styles.footer} testID="prepare-offline-download-footer">
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total download</Text>
        <Text style={styles.totalValue} testID="prepare-offline-total-bytes">
          {formatByteSize(totalBytes)}
        </Text>
      </View>

      {session === 'complete' ? (
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
      ) : session === 'downloading' ? (
        <View
          style={styles.controlsColumn}
          testID="prepare-offline-download-controls-downloading"
        >
          <FooterActionButton
            label="Pause"
            Icon={Pause}
            disabled={disabled}
            onPress={onPause}
            testID="prepare-offline-download-pause"
          />
          <FooterActionButton
            label="Cancel"
            Icon={X}
            disabled={disabled}
            onPress={onCancel}
            testID="prepare-offline-download-cancel"
          />
        </View>
      ) : session === 'paused' ? (
        <View
          style={styles.controlsColumn}
          testID="prepare-offline-download-controls-paused"
        >
          <FooterActionButton
            label="Resume"
            Icon={Play}
            variant="primary"
            disabled={disabled}
            onPress={onResume}
            testID="prepare-offline-download-resume"
          />
          <FooterActionButton
            label="Cancel"
            Icon={X}
            disabled={disabled}
            onPress={onCancel}
            testID="prepare-offline-download-cancel"
          />
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.downloadButton,
            !canDownload && styles.downloadButtonDisabled,
          ]}
          onPress={onDownload}
          disabled={!canDownload || disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDownload || disabled }}
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

interface FooterActionButtonProps {
  label: string;
  Icon: LucideIcon;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

function FooterActionButton({
  label,
  Icon,
  variant = 'secondary',
  disabled,
  onPress,
  testID,
}: FooterActionButtonProps) {
  const isPrimary = variant === 'primary';
  const iconColor = disabled
    ? theme.colors.mutedForeground
    : isPrimary
    ? theme.colors.primaryForeground
    : theme.colors.foreground;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={[
        styles.controlButton,
        isPrimary && styles.controlButtonPrimary,
        disabled && styles.controlButtonDisabled,
      ]}
    >
      <Icon size={18} color={iconColor} strokeWidth={listIconStrokeWidth} />
      <Text
        style={[
          styles.controlButtonLabel,
          isPrimary && styles.controlButtonLabelPrimary,
          disabled && styles.controlButtonLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
    borderRadius: theme.radius.md,
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
  controlsColumn: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  controlButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardBackground,
  },
  controlButtonPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  controlButtonLabel: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  controlButtonLabelPrimary: {
    color: theme.colors.primaryForeground,
  },
  controlButtonLabelDisabled: {
    color: theme.colors.mutedForeground,
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
