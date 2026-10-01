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

  const variant = ownershipState === 'mine' ? 'mine' : 'other';

  return (
    <View style={styles.icon} testID={`chapter-ownership-${variant}`}>
      <ChapterOwnershipIcon size={size} variant={variant} />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
  },
});
