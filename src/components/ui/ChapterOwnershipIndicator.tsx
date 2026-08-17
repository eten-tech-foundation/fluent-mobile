import React from 'react';
import { iconSizes } from '../../theme';
import { StyleSheet, View } from 'react-native';
import { ChapterOwnershipState } from '../../types/db/types';
import { ChapterOwnershipIcon } from './ChapterOwnershipIcon';

interface ChapterOwnershipIndicatorProps {
  ownershipState: ChapterOwnershipState;
  size?: number;
}

export function ChapterOwnershipIndicator({
  ownershipState,
  size = iconSizes.chapterSync,
}: ChapterOwnershipIndicatorProps) {
  if (ownershipState === 'unassigned') {
    return null;
  }

  return (
    <View style={styles.icon}>
      <ChapterOwnershipIcon
        size={size}
        variant={ownershipState === 'mine' ? 'mine' : 'other'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
  },
});
