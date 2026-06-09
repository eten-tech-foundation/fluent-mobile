import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Settings } from 'lucide-react-native';
import FluentLogoWhite from '../../assets/icons/fluent-logo-white.svg';
import { CloudSyncStatusIcon } from '../ui/CloudSyncStatusIcon';
import {
  theme,
  iconSizes,
  logoSize,
  headerLayout,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme';
import { SyncStatus, SYNC_STATUS_LABELS } from '../../utils/syncStatusState';

interface PageHeaderProps {
  onSettingsPress?: () => void;
  onSyncPress?: () => void;
  syncStatus: SyncStatus;
}

export function PageHeader({
  onSettingsPress,
  onSyncPress,
  syncStatus,
}: PageHeaderProps) {
  const iconColor = theme.colors.primaryForeground;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onSettingsPress}
        style={styles.settingsSlot}
        accessibilityLabel="Settings"
        hitSlop={touchHitSlop}
      >
        <Settings
          size={iconSizes.header}
          color={iconColor}
          strokeWidth={listIconStrokeWidth}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onSyncPress}
        style={styles.syncSlot}
        accessibilityLabel={SYNC_STATUS_LABELS[syncStatus]}
        accessibilityRole="button"
        hitSlop={touchHitSlop}
      >
        <CloudSyncStatusIcon status={syncStatus} decorative />
      </TouchableOpacity>

      <View style={styles.logoOverlay} pointerEvents="none">
        <FluentLogoWhite
          width={logoSize.width}
          height={logoSize.height}
          style={styles.logo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: headerLayout.paddingHorizontal,
    paddingVertical: headerLayout.paddingVertical,
    minHeight: headerLayout.minHeight,
  },
  settingsSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
    zIndex: 1,
  },
  syncSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    padding: 6,
    zIndex: 1,
  },
  logoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    marginVertical: logoSize.marginVertical,
  },
});
