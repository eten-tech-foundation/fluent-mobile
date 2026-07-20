import React from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SyncStatus, SYNC_STATUS_LABELS } from '../../utils/syncStatusState';
import { useHeaderSafeAreaPadding } from './useHeaderSafeAreaPadding';
import { CloudSyncStatusIcon } from '../ui/CloudSyncStatusIcon';
import { ChevronLeft } from 'lucide-react-native';
import { theme } from '../../theme';
import {
  headerLayout,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme/iconSpecs';

interface StackScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onSyncPress?: () => void;
  syncStatus?: SyncStatus;
  subtitleLines?: number;
}

export function StackScreenHeader({
  title,
  subtitle,
  onBack,
  onSyncPress,
  syncStatus,
  subtitleLines = 1,
}: StackScreenHeaderProps) {
  const headerPadding = useHeaderSafeAreaPadding();

  return (
    <View style={[styles.header, headerPadding]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={theme.colors.cardBackground}
      />
      <TouchableOpacity
        onPress={onBack}
        hitSlop={touchHitSlop}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <ChevronLeft
          size={iconSizes.header}
          color={theme.colors.foreground}
          strokeWidth={listIconStrokeWidth}
        />
      </TouchableOpacity>

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={subtitleLines}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {onSyncPress && syncStatus ? (
        <TouchableOpacity
          onPress={onSyncPress}
          hitSlop={touchHitSlop}
          style={styles.syncButton}
          accessibilityRole="button"
          accessibilityLabel={SYNC_STATUS_LABELS[syncStatus]}
        >
          <CloudSyncStatusIcon status={syncStatus} decorative />
        </TouchableOpacity>
      ) : (
        <View style={styles.syncPlaceholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: headerLayout.paddingHorizontal,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs,
  },
  titles: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  subtitle: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  syncButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs + 2,
  },
  syncPlaceholder: {
    width: iconSizes.header + 12,
  },
});
