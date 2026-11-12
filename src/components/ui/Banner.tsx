import React, { useEffect } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme, useThemedStyles } from '../../theme/useTheme';
import { Warning } from './icons';

/** Figma Gap / Banner height for one line of message. */
const BANNER_MIN_HEIGHT = 56;
const PRESSED_OPACITY = 0.7;

export interface BannerProps {
  message: string;
  /** The one thing to do about it, e.g. "Sign in". */
  actionLabel: string;
  onAction: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A warning across the top of a page (Figma Gap / Banner, node 2644:62):
 * surface/inverse with the message and one action.
 */
export function Banner({
  message,
  actionLabel,
  onAction,
  style,
  testID,
}: BannerProps) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    banner: {
      minHeight: BANNER_MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.surfaceInverse,
    },
    message: { ...t.type.label, color: t.roles.fgOnInverse, flex: 1 },
    action: { ...t.type.label, color: t.roles.fgOnInverse },
    pressed: { opacity: PRESSED_OPACITY },
  }));

  // Android live regions only speak later changes, not the view appearing.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const slop = theme.spacing.md;
  return (
    <View style={[styles.banner, style]} testID={testID}>
      <Warning
        color={theme.roles.fgOnInverse}
        size={theme.controlSizes.icon24}
      />
      <Text style={styles.message}>{message}</Text>
      <Pressable
        onPress={onAction}
        android_disableSound
        hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={({ pressed }) => pressed && styles.pressed}
        testID={testID ? `${testID}-action` : undefined}
      >
        <Text style={styles.action}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
