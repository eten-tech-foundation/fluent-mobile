import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ChapterSyncState } from '../../types/db/types';
import { iconSizes } from '../../theme';
import { RecordingCloudIcon } from './RecordingCloudIcon';

interface ChapterCloudSyncIndicatorProps {
  syncState: ChapterSyncState;
}

/** Green/yellow cloud beside the chapter title (`h-4 w-4` in mock). */
export function ChapterCloudSyncIndicator({
  syncState,
}: ChapterCloudSyncIndicatorProps) {
  if (syncState === 'none') {
    return null;
  }

  return (
    <View style={styles.icon}>
      <RecordingCloudIcon
        size={iconSizes.chapterSync}
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
