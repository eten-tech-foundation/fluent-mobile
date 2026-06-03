import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CloudCheck, CloudUpload } from 'lucide-react-native';
import { ProjectSyncState } from '../../types/db/types';
import { theme, iconSizes, lucideStrokeWidth } from '../../theme';

interface SyncIndicatorProps {
  syncState: ProjectSyncState;
}

const SYNC_ICONS = {
  synced: { Icon: CloudCheck, color: theme.colors.syncSynced },
  unsynced: { Icon: CloudUpload, color: theme.colors.syncUnsynced },
} as const;

export function SyncIndicator({ syncState }: SyncIndicatorProps) {
  if (syncState === 'none') {
    return null;
  }

  const { Icon, color } = SYNC_ICONS[syncState];

  return (
    <View style={styles.container}>
      <Icon
        size={iconSizes.projectSync}
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
