import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from '../../theme';

type RecordCircleVariant = 'record' | 'primary' | 'play' | 'stop' | 'muted';

type Props = {
  variant: RecordCircleVariant;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
  children: React.ReactNode;
  /** Override diameter; defaults follow Lovable h-24 / h-20 / h-14. */
  size?: number;
};

const VARIANT_SIZE: Record<RecordCircleVariant, number> = {
  record: theme.recordControlSizes.idle,
  primary: theme.recordControlSizes.primary,
  play: theme.recordControlSizes.primary,
  stop: theme.recordControlSizes.stop,
  muted: theme.recordControlSizes.secondary,
};

/**
 * Shared circular control for Record-tab idle / capture / review.
 * Matches Lovable + docs/design/record-tab button chrome.
 */
export function RecordCircleButton({
  variant,
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
  children,
  size,
}: Props) {
  const diameter = size ?? VARIANT_SIZE[variant];
  const style: StyleProp<ViewStyle> = [
    styles.base,
    { width: diameter, height: diameter, borderRadius: diameter / 2 },
    variantStyles[variant],
    disabled && styles.disabled,
  ];

  if (!onPress) {
    return (
      <View
        style={style}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: true }}
        testID={testID}
      >
        {children}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={style}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      activeOpacity={0.85}
    >
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});

const variantStyles = StyleSheet.create({
  record: {
    backgroundColor: theme.colors.recordAccent,
    borderWidth: 4,
    borderColor: theme.colors.primaryForeground,
    ...theme.shadows.elevated,
  },
  primary: {
    backgroundColor: theme.colors.recordAccent,
    borderWidth: 3,
    borderColor: theme.colors.primaryForeground,
    ...theme.shadows.elevated,
  },
  play: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.elevated,
  },
  stop: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.soft,
  },
  muted: {
    backgroundColor: theme.colors.cardBackground,
    opacity: 0.6,
  },
});
