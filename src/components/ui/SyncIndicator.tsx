import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ProjectSyncState } from '../../types/db/types';
import { iconSizes } from '../../theme';
import { RecordingCloudIcon } from './RecordingCloudIcon';

interface SyncIndicatorProps {
  syncState: ProjectSyncState;
}

export function SyncIndicator({ syncState }: SyncIndicatorProps) {
  if (syncState === 'none') {
    return null;
  }

  return (
    <View style={styles.icon}>
      <RecordingCloudIcon
        size={iconSizes.projectSync}
        variant={syncState === 'synced' ? 'synced' : 'pending'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
  },
});
