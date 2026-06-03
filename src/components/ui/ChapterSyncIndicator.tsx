import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Cloud, CloudCheck } from 'lucide-react-native';
import { ChapterSyncState } from '../../types/db/types';
import { theme, iconSizes, lucideStrokeWidth } from '../../theme';

interface ChapterSyncIndicatorProps {
  syncState: ChapterSyncState;
}

const SYNC_ICONS = {
  synced: { Icon: CloudCheck, color: theme.colors.syncSynced },
  deviceOnly: { Icon: Cloud, color: theme.colors.syncOffline },
} as const;

export function ChapterSyncIndicator({ syncState }: ChapterSyncIndicatorProps) {
  if (syncState === 'none') {
    return null;
  }

  const { Icon, color } = SYNC_ICONS[syncState];

  return (
    <View style={styles.container}>
      <Icon
        size={iconSizes.chapterSync}
        color={color}
        strokeWidth={lucideStrokeWidth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: theme.spacing.sm,
  },
});
