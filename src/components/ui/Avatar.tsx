import React from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useThemedStyles } from '../../theme/useTheme';

/** Figma Gap / Avatar: 48pt, which is also the minimum touch target. */
export const AVATAR_SIZE = 48;
const PRESSED_OPACITY = 0.7;

export type AvatarProps = {
  /** One or two letters, e.g. "JS". */
  initials: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & (
  | {
      onPress: () => void;
      /** Spoken in place of the initials, e.g. "Jordan Smith". */
      accessibilityLabel: string;
    }
  | {
      /** Inside a row that speaks for it, like an account in a list. */
      onPress?: undefined;
      accessibilityLabel?: undefined;
    }
);

/**
 * An account's initials on surface/inverse (Figma Gap / Avatar, node
 * 2644:70). Flat, since Figma draws no tactile press for it.
 */
export function Avatar({
  initials,
  accessibilityLabel,
  onPress,
  style,
  testID,
}: AvatarProps) {
  const styles = useThemedStyles(t => ({
    avatar: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.surfaceInverse,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: PRESSED_OPACITY },
    initials: { ...t.type.label, color: t.roles.fgOnInverse },
  }));

  const label = (
    <Text style={styles.initials} numberOfLines={1}>
      {initials}
    </Text>
  );

  if (!onPress) {
    return (
      <View
        style={[styles.avatar, style]}
        importantForAccessibility="no-hide-descendants"
        testID={testID}
      >
        {label}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      android_disableSound
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.avatar, pressed && styles.pressed, style]}
      testID={testID}
    >
      {label}
    </Pressable>
  );
}
