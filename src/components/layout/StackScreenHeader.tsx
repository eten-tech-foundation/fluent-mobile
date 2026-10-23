import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { SyncStatus, formatSyncStatusLabel } from '../../utils/syncStatusState';
import { CloudSyncStatusIcon } from '../ui/CloudSyncStatusIcon';
import { useThemedStyles } from '../../theme/useTheme';
import { iconSizes, touchHitSlop } from '../../theme/iconSpecs';
import { AppHeader, HeaderBackButton } from './AppHeader';

interface StackScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onSyncPress?: () => void;
  syncStatus?: SyncStatus;
  failedErrorText?: string | null;
  subtitleLines?: number;
  backTestID?: string;
}

export function StackScreenHeader({
  title,
  subtitle,
  onBack,
  onSyncPress,
  syncStatus,
  failedErrorText,
  subtitleLines = 1,
  backTestID,
}: StackScreenHeaderProps) {
  const styles = useStyles();
  return (
    <AppHeader
      tone="surface"
      title={title}
      subtitle={subtitle}
      subtitleLines={subtitleLines}
      titleAlign="start"
      left={
        <HeaderBackButton
          onPress={onBack}
          testID={backTestID ?? 'stack-header-back'}
        />
      }
      right={
        onSyncPress && syncStatus ? (
          <TouchableOpacity
            onPress={onSyncPress}
            hitSlop={touchHitSlop}
            style={styles.syncButton}
            accessibilityRole="button"
            accessibilityLabel={formatSyncStatusLabel(syncStatus, {
              failedErrorText,
            })}
            testID="stack-header-sync-button"
          >
            <CloudSyncStatusIcon status={syncStatus} decorative />
          </TouchableOpacity>
        ) : (
          <View style={styles.syncPlaceholder} />
        )
      }
    />
  );
}

const useStyles = () =>
  useThemedStyles(theme => ({
    syncButton: {
      borderRadius: theme.radius.full,
      padding: theme.spacing.xs + 2,
    },
    syncPlaceholder: {
      width: iconSizes.header + 12,
    },
  }));
