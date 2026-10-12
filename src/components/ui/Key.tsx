import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, useThemedStyles } from '../../theme/useTheme';
import { useHaptics } from '../../hooks/useHaptics';

/** Figma Key: 96pt tall, lip 12pt (8pt when sunk) sitting 2pt off the bottom edge. */
const KEY_HEIGHT = 96;
const LIP_HEIGHT = 12;
const LIP_HEIGHT_DOWN = 8;
const LIP_BOTTOM = 2;

export type KeyIconProps = { color: string; size: number };

export interface KeyProps {
  icon: React.ComponentType<KeyIconProps>;
  accessibilityLabel: string;
  onPress?: (event: GestureResponderEvent) => void;
  /**
   * Latched: held down while on (e.g. Play while playing). Reported to
   * TalkBack as `selected` unless `announceLatched` is false.
   */
  active?: boolean;
  /**
   * Set false when the label already names the action (Play / Pause), so
   * TalkBack doesn't also say "selected".
   */
  announceLatched?: boolean;
  disabled?: boolean;
  /** Highlight lip along the bottom edge (Figma `Lip`). */
  lip?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Hardware key from Foundations · 07 Tactile (Figma Key, node 2326:34).
 * Raised by default; sinks into an inset well while pressed or latched.
 * Disabled fades only the icon to opacity/disabled, so it reads on the dark
 * KeyDeck and in every mode.
 */
export function Key({
  icon: Icon,
  accessibilityLabel,
  onPress,
  active = false,
  announceLatched = true,
  disabled = false,
  lip = true,
  style,
  testID,
}: KeyProps) {
  const theme = useTheme();
  const haptics = useHaptics();
  const styles = useThemedStyles(t => ({
    key: {
      height: KEY_HEIGHT,
      minWidth: 48,
      borderRadius: t.radius.xs,
    },
    face: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: t.radius.xs,
    },
    raisedFace: {
      top: 0,
      backgroundColor: t.roles.surfaceDefault,
      boxShadow: t.elevation.raised,
    },
    sunkenFace: {
      top: t.spacing.xs,
      backgroundColor: t.roles.surfaceSunken,
      boxShadow: t.elevation.inset,
    },
    content: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lip: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: LIP_BOTTOM,
      backgroundColor: t.roles.surfaceHighlight,
    },
    icon: {
      width: t.controlSizes.icon32,
      height: t.controlSizes.icon32,
    },
    iconDisabled: {
      opacity: t.opacity.disabled,
    },
    iconOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
    },
  }));

  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const down = pressed || active;
  const progress = useSharedValue(down ? 1 : 0);
  const { motion, spacing } = theme;
  const sink = spacing.xs;

  const animateTo = useCallback(
    (down: boolean) => {
      const { x1, y1, x2, y2 } = motion.easeStandard;
      progress.value = withTiming(down ? 1 : 0, {
        duration: reduceMotion ? 0 : down ? motion.pressMs : motion.releaseMs,
        easing: Easing.bezier(x1, y1, x2, y2),
      });
    },
    [motion, progress, reduceMotion],
  );

  // Settle on pressed || active once both updates land. Android can deliver
  // onPressOut after onPress on quick taps, so the handlers don't animate out.
  useEffect(() => {
    animateTo(down);
  }, [down, animateTo]);

  // The sunken face stays opaque underneath and only the raised face fades,
  // so the deck never shows through mid-press (no flash on release).
  const raisedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
  }));
  const downIconStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const contentStyle = useAnimatedStyle(() => ({
    top: sink * progress.value,
  }));
  const lipStyle = useAnimatedStyle(() => ({
    height: LIP_HEIGHT - (LIP_HEIGHT - LIP_HEIGHT_DOWN) * progress.value,
  }));

  const interactive = !disabled && !!onPress;
  // Disabled keeps the key solid and fades only the glyph. Opacity rather than
  // fg/inactive, which matches the key face in Canvas and Accent.
  const restIconColor = theme.roles.fgSecondary;
  const iconSize = theme.controlSizes.icon32;

  return (
    <Pressable
      onPressIn={() => {
        // Start the sink immediately rather than a render later.
        animateTo(true);
        setPressed(true);
        haptics.press();
      }}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      disabled={!interactive}
      android_disableSound
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: announceLatched && active }}
      style={[styles.key, style]}
      testID={testID}
    >
      <Animated.View style={[styles.face, styles.sunkenFace]} />
      <Animated.View
        style={[styles.face, styles.raisedFace, raisedStyle]}
        testID={testID ? `${testID}-raised` : undefined}
      />
      <Animated.View style={[styles.content, contentStyle]}>
        <Animated.View
          style={[styles.icon, disabled && styles.iconDisabled]}
          testID={testID ? `${testID}-icon` : undefined}
        >
          <Icon color={restIconColor} size={iconSize} />
          <Animated.View
            style={[styles.iconOverlay, downIconStyle]}
            testID={testID ? `${testID}-down-icon` : undefined}
          >
            <Icon color={theme.roles.fgPrimary} size={iconSize} />
          </Animated.View>
        </Animated.View>
        {lip ? <Animated.View style={[styles.lip, lipStyle]} /> : null}
      </Animated.View>
    </Pressable>
  );
}
