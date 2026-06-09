import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChapterSyncState } from '../../types/db/types';
import { iconSizes } from '../../theme';
import { RecordingCloudIcon } from './RecordingCloudIcon';

interface ChapterCloudSyncIndicatorProps {
  syncState: ChapterSyncState;
  size?: number;
}

/** Green/yellow cloud beside the chapter title (`h-6 w-6` on project rows). */
export function ChapterCloudSyncIndicator({
  syncState,
  size = iconSizes.chapterSync,
}: ChapterCloudSyncIndicatorProps) {
  if (syncState === 'none') {
    return null;
  }

  return (
    <View style={styles.icon}>
      <RecordingCloudIcon
        size={size}
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
