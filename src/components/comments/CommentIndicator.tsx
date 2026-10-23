import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MessageSquare } from 'lucide-react-native';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';

export type CommentIndicatorProps = {
  /**
   * Known positive count shows the indicator. `null` / `undefined` = unknown
   * (must not render a fake zero). `0` hides the indicator.
   */
  count: number | null | undefined;
  onPress?: () => void;
  testID?: string;
};

/**
 * Controlled Lucide `message-square` affordance for a real positive comment
 * count only. Does not invent zeros when count is unknown.
 */
export function CommentIndicator({
  count,
  onPress,
  testID = 'comment-indicator',
}: CommentIndicatorProps) {
  if (typeof count !== 'number' || count <= 0 || !Number.isFinite(count)) {
    return null;
  }

  const label = `Comments, ${count}`;
  const content = (
    <View style={styles.row} testID={testID} accessibilityLabel={label}>
      <MessageSquare
        size={iconSizes.headerTab}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
        testID={`${testID}-icon`}
      />
      <Text style={styles.count} testID={`${testID}-count`}>
        {count}
      </Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`${testID}-press`}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  count: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    fontWeight: theme.typography.weights.medium,
  },
});
