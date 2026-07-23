import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Pause, Play, X, type LucideIcon } from 'lucide-react-native';
import { SyncPageStatus } from '../../types/sync/types';
import { theme, listIconStrokeWidth } from '../../theme';

export const SYNC_NOW_CELLULAR_DISABLED_MESSAGE =
  'Connect to WiFi to sync, or enable cellular uploads in Settings.';

export interface SyncActionControlsProps {
  status: SyncPageStatus;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onSyncNow: () => void;
  syncNowDisabled?: boolean;
  busy?: boolean;
}

export function SyncActionControls({
  status,
  onPause,
  onResume,
  onCancel,
  onSyncNow,
  syncNowDisabled = false,
  busy = false,
}: SyncActionControlsProps) {
  const disabled = busy;

  switch (status) {
    case 'syncing':
      return (
        <View style={styles.controlsRow} testID="sync-action-controls-syncing">
          <SyncActionButton
            label="Pause"
            Icon={Pause}
            variant="secondary"
            disabled={disabled}
            onPress={onPause}
            testID="sync-action-pause"
          />
          <SyncActionButton
            label="Cancel"
            Icon={X}
            variant="secondary"
            disabled={disabled}
            onPress={onCancel}
            testID="sync-action-cancel"
          />
        </View>
      );

    case 'paused':
      return (
        <View
          style={styles.controlsColumn}
          testID="sync-action-controls-paused"
        >
          <View style={styles.controlsRow}>
            <SyncActionButton
              label="Resume"
              Icon={Play}
              variant="secondary"
              disabled={disabled || syncNowDisabled}
              onPress={onResume}
              testID="sync-action-resume"
            />
            <SyncActionButton
              label="Cancel"
              Icon={X}
              variant="secondary"
              disabled={disabled}
              onPress={onCancel}
              testID="sync-action-cancel"
            />
          </View>
          <SyncActionButton
            label="Sync Now"
            Icon={Play}
            variant="primary"
            fullWidth
            disabled={disabled || syncNowDisabled}
            onPress={onSyncNow}
            testID="sync-action-sync-now"
          />
          {syncNowDisabled ? (
            <Text
              style={styles.disabledHint}
              testID="sync-action-sync-now-disabled-hint"
            >
              {SYNC_NOW_CELLULAR_DISABLED_MESSAGE}
            </Text>
          ) : null}
        </View>
      );

    case 'pending':
      return (
        <View
          style={styles.controlsColumn}
          testID="sync-action-controls-pending"
        >
          <SyncActionButton
            label="Sync Now"
            Icon={Play}
            variant="primary"
            fullWidth
            disabled={disabled || syncNowDisabled}
            onPress={onSyncNow}
            testID="sync-action-sync-now"
          />
          {syncNowDisabled ? (
            <Text
              style={styles.disabledHint}
              testID="sync-action-sync-now-disabled-hint"
            >
              {SYNC_NOW_CELLULAR_DISABLED_MESSAGE}
            </Text>
          ) : null}
        </View>
      );

    case 'uploadComplete':
    case 'allComplete':
    default:
      return null;
  }
}

interface SyncActionButtonProps {
  label: string;
  Icon: LucideIcon;
  variant: 'primary' | 'secondary';
  fullWidth?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

function SyncActionButton({
  label,
  Icon,
  variant,
  fullWidth,
  disabled,
  onPress,
  testID,
}: SyncActionButtonProps) {
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
        fullWidth && styles.controlButtonFullWidth,
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
  controlsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: theme.spacing.sm,
  },
  controlsColumn: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.cardBackground,
  },
  controlButtonPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  controlButtonFullWidth: {
    width: '100%',
    flex: 0,
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
  disabledHint: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
});
