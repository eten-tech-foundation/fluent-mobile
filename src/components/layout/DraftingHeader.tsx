import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { theme } from '../../theme';
import {
  headerLayout,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme/iconSpecs';
import { ChevronLeft, CloudUpload } from 'lucide-react-native';

interface DraftingHeaderProps {
  title: string;
  onBack: () => void;
  onSyncPress?: () => void;
  isSyncing?: boolean;
}
export function DraftingHeader({
  title,
  onBack,
  onSyncPress,
  isSyncing = false,
}: DraftingHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.sideSlot}>
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
      </View>

      <View style={styles.centerOverlay} pointerEvents="none">
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>

      <View style={[styles.sideSlot, styles.sideSlotRight]}>
        {onSyncPress ? (
          <TouchableOpacity
            onPress={onSyncPress}
            disabled={isSyncing}
            hitSlop={touchHitSlop}
            style={styles.syncButton}
            accessibilityRole="button"
            accessibilityLabel={
              isSyncing ? 'Syncing. Open Sync page.' : 'Sync. Open Sync page.'
            }
            accessibilityState={{ disabled: isSyncing }}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={theme.colors.foreground} />
            ) : (
              <CloudUpload
                size={iconSizes.header}
                color={theme.colors.foreground}
                strokeWidth={listIconStrokeWidth}
              />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: headerLayout.paddingHorizontal,
    paddingVertical: headerLayout.paddingVertical,
    minHeight: headerLayout.minHeight,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sideSlot: {
    width: headerLayout.sideSlot,
    height: headerLayout.sideSlot,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  sideSlotRight: {
    alignItems: 'flex-end',
  },
  backButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs,
  },
  syncButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs + 2,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
});
