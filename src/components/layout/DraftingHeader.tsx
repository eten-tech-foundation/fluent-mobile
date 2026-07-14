import React from 'react';
import { theme } from '../../theme';
import { ChevronLeft } from 'lucide-react-native';
import { SyncStatus } from '../../utils/syncStatusState';
import { PageHeaderSyncButton } from '../ui/PageHeaderSyncButton';
import { AccountInitialsButton } from '../ui/AccountInitialsButton';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  headerLayout,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme/iconSpecs';

interface DraftingHeaderProps {
  title: string;
  onBack: () => void;
  syncStatus?: SyncStatus;
  onSyncPress?: () => void;
  showAccountIndicator?: boolean;
  accountFirstName?: string;
  accountLastName?: string;
  accountEmail?: string;
  onAccountPress?: () => void;
}

export function DraftingHeader({
  title,
  onBack,
  syncStatus,
  onSyncPress,
  showAccountIndicator = false,
  accountFirstName,
  accountLastName,
  accountEmail,
  onAccountPress,
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

      <View style={styles.rightActions}>
        {syncStatus && onSyncPress ? (
          <PageHeaderSyncButton syncStatus={syncStatus} onPress={onSyncPress} />
        ) : null}
        {showAccountIndicator && onAccountPress ? (
          <AccountInitialsButton
            firstName={accountFirstName}
            lastName={accountLastName}
            email={accountEmail}
            onPress={onAccountPress}
          />
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
  rightActions: {
    minWidth: headerLayout.sideSlot * 2,
    height: headerLayout.sideSlot,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
    zIndex: 1,
  },
  backButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs,
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
