import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TriangleAlert, Users } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

interface ChapterConflictIndicatorProps {
  size?: number;
}

/**
 * Users glyph with a triangle-alert badge — chapter-list conflict rollup (#260).
 * Sits to the right of the cloud sync indicator; does not replace it.
 */
export function ChapterConflictIndicator({
  size = iconSizes.chapterSync,
}: ChapterConflictIndicatorProps) {
  const badgeSize = Math.max(10, Math.round(size * 0.55));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityLabel="Unresolved recording conflict"
      accessibilityRole="image"
      testID="chapter-conflict-indicator"
    >
      <Users
        size={size}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.badge}>
        <TriangleAlert
          size={badgeSize}
          color={theme.colors.warningIcon}
          strokeWidth={listIconStrokeWidth}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    position: 'relative',
  },
  badge: {
    // Optical align of the alert glyph on the Users icon (not a layout gap).
    position: 'absolute',
    right: -2,
    bottom: -2,
  },
});
