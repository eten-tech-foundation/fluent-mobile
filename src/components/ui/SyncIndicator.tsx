import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CloudCheck, CloudUpload } from 'lucide-react-native';
import { theme } from '../../theme';
import { iconSizes } from '../../theme/iconSpecs';
import { ProjectSyncState } from '../../utils/projectSyncState';

interface SyncIndicatorProps {
  syncState: ProjectSyncState;
}

export function SyncIndicator({ syncState }: SyncIndicatorProps) {
  if (syncState === 'none') {
    return null;
  }

  const isSynced = syncState === 'synced';
  const color = isSynced ? theme.colors.syncSynced : theme.colors.syncUnsynced;
  const Icon = isSynced ? CloudCheck : CloudUpload;

  return (
    <View style={styles.container}>
      <Icon size={iconSizes.projectSync} color={color} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginLeft: theme.spacing.sm,
  },
});
