import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { useThemedStyles } from '../../theme/useTheme';

/** Figma Progress dot: 4 × 4. */
const DOT_SIZE = 4;

export interface ProgressDotsProps {
  count: number;
  /** Zero-based current item, drawn in fg/primary. */
  index: number;
  /** e.g. "Pericope 3 of 16". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Position in a list, shown in a screen header (Figma Progress dot, node
 * 2409:509): fg/secondary dots with the current one in fg/primary.
 */
export function ProgressDots({
  count,
  index,
  accessibilityLabel,
  style,
  testID,
}: ProgressDotsProps) {
  const styles = useThemedStyles(t => ({
    row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
    dot: {
      width: DOT_SIZE,
      height: DOT_SIZE,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgSecondary,
    },
    current: { backgroundColor: t.roles.fgPrimary },
  }));

  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i === index && styles.current]}
          testID={testID ? `${testID}-dot-${i}` : undefined}
        />
      ))}
    </View>
  );
}
