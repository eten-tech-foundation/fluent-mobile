import React from 'react';
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useHaptics } from '../../hooks/useHaptics';
import { usePressProgress } from '../../hooks/usePressProgress';
import {
  ColorModeScope,
  useColorMode,
  useTheme,
  useThemedStyles,
} from '../../theme/useTheme';

/** Figma Round button: 48pt circle, which is also the minimum touch target. */
const BUTTON_SIZE = 48;

export type RoundButtonIconProps = { color: string; size: number };

export interface RoundButtonProps {
  icon: React.ComponentType<RoundButtonIconProps>;
  accessibilityLabel: string;
  /**
   * Omit for a circle that only shows a status: TalkBack reads its label
   * without calling it a button.
   */
  onPress?: (event: GestureResponderEvent) => void;
  /**
   * Figma `Style`. Soft is tactile, for light screens; Flat is for dark and
   * blue screens and always uses Canvas colors.
   */
  variant?: 'soft' | 'flat';
  /**
   * Text after the icon. The circle stretches into a pill at the same height,
   * for actions that need a word, like Listen and Record.
   */
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Screen round button from Foundations · 07 Tactile (Figma Round button,
 * node 2326:64). Sinks to surface/sunken while pressed, nudging the icon 2pt.
 */
export function RoundButton({ variant = 'soft', ...props }: RoundButtonProps) {
  const mode = useColorMode();
  return (
    <ColorModeScope value={variant === 'flat' ? 'canvas' : mode}>
      <RoundButtonBody variant={variant} {...props} />
    </ColorModeScope>
  );
}

function RoundButtonBody({
  icon: Icon,
  accessibilityLabel,
  onPress,
  variant,
  label,
  disabled = false,
  style,
  testID,
}: RoundButtonProps & { variant: 'soft' | 'flat' }) {
  const theme = useTheme();
  const haptics = useHaptics();
  const styles = useThemedStyles(t => ({
    button: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: t.radius.full,
    },
    pill: {
      width: undefined,
      minWidth: BUTTON_SIZE,
      paddingHorizontal: t.spacing.lg,
    },
    face: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: t.radius.full,
    },
    softRaised: {
      backgroundColor: t.roles.surfaceDefault,
      boxShadow: t.elevation.soft,
    },
    softSunken: {
      backgroundColor: t.roles.surfaceSunken,
      boxShadow: t.elevation.inset,
    },
    flatRaised: { backgroundColor: t.roles.surfaceDefault },
    flatSunken: { backgroundColor: t.roles.surfaceSunken },
    rim: {
      position: 'absolute',
      top: -t.spacing.xxs,
      left: -t.spacing.xxs,
      right: -t.spacing.xxs,
      bottom: -t.spacing.xxs,
      borderRadius: t.radius.full,
      borderWidth: t.stroke[1],
      borderColor: t.roles.borderRim,
    },
    content: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.sm,
    },
    label: { ...t.type.title, color: t.roles.fgPrimary },
    disabled: { opacity: t.opacity.disabled },
  }));

  const { progress, onPressIn, onPressOut } = usePressProgress();
  const nudge = theme.spacing.xxs;
  const soft = variant === 'soft';

  // Sunken face stays opaque underneath; only the raised face fades (no flash).
  const raisedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: nudge * progress.value }],
  }));

  const rootStyle = [
    styles.button,
    label ? styles.pill : null,
    style,
    disabled && styles.disabled,
  ];
  const body = (
    <>
      {soft ? (
        <View
          style={styles.rim}
          testID={testID ? `${testID}-rim` : undefined}
        />
      ) : null}
      <Animated.View
        style={[styles.face, soft ? styles.softSunken : styles.flatSunken]}
      />
      <Animated.View
        style={[
          styles.face,
          soft ? styles.softRaised : styles.flatRaised,
          raisedStyle,
        ]}
        testID={testID ? `${testID}-raised` : undefined}
      />
      <Animated.View style={[styles.content, iconStyle]}>
        <Icon color={theme.roles.fgPrimary} size={theme.controlSizes.icon24} />
        {label ? (
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </>
  );

  // Pressable reports itself disabled and tappable even with no onPress.
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={rootStyle}
        testID={testID}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPressIn={() => {
        onPressIn();
        haptics.press();
      }}
      onPressOut={onPressOut}
      onPress={onPress}
      disabled={disabled}
      android_disableSound
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={rootStyle}
      testID={testID}
    >
      {body}
    </Pressable>
  );
}
