import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Settings, CloudUpload } from 'lucide-react-native';
import FluentLogoWhite from '../../assets/icons/fluent-logo-white.svg';
import {
  theme,
  iconSizes,
  logoSize,
  headerLayout,
  lucideStrokeWidth,
  touchHitSlop,
} from '../../theme';

interface PageHeaderProps {
  onSettingsPress?: () => void;
  onSyncPress?: () => void;
  isSyncing?: boolean;
}

export function PageHeader({
  onSettingsPress,
  onSyncPress,
  isSyncing = false,
}: PageHeaderProps) {
  const iconColor = theme.colors.primaryForeground;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onSettingsPress}
        style={styles.sideSlot}
        accessibilityLabel="Settings"
        hitSlop={touchHitSlop}
      >
        <Settings
          size={iconSizes.header}
          color={iconColor}
          strokeWidth={lucideStrokeWidth}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onSyncPress}
        disabled={isSyncing}
        style={styles.sideSlot}
        accessibilityLabel="Sync"
        hitSlop={touchHitSlop}
      >
        {isSyncing ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <CloudUpload
            size={iconSizes.header}
            color={iconColor}
            strokeWidth={lucideStrokeWidth}
          />
        )}
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
  sideSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
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
