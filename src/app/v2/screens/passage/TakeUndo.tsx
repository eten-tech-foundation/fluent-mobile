import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { UndoBold } from '../../../../components/ui/icons';
import { UNDO_MS } from '../../../../hooks/usePendingDelete';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

/** Figma's deleted take card (2557-1257): a 56pt Undo over a 3pt timer. */
const UNDO_BUTTON = 56;
const TIMER_H = 3;
const FADE_MS = 150;

/**
 * What the take card shows once its take is in the bin: Undo, the take's
 * name struck out, and a timer running down the undo window.
 */
export function TakeUndo({
  takeLabel,
  shown,
  onUndo,
}: {
  /** e.g. "Take 3". */
  takeLabel: string;
  shown: boolean;
  onUndo: () => void;
}) {
  const { roles, controlSizes } = useTheme();
  const reduceMotion = useReducedMotion();
  const timer = useSharedValue(1);
  useEffect(() => {
    timer.value = 1;
    timer.value = reduceMotion
      ? 0
      : withTiming(0, { duration: UNDO_MS, easing: Easing.linear });
  }, [takeLabel, reduceMotion, timer]);
  const timerStyle = useAnimatedStyle(() => ({
    width: `${timer.value * 100}%`,
  }));
  const styles = useThemedStyles(t => ({
    undo: {
      position: 'absolute',
      top: t.spacing.xs,
      bottom: t.spacing.xxl,
      left: t.spacing.lg,
      right: t.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.sm,
      paddingBottom: t.spacing.md,
    },
    button: {
      width: UNDO_BUTTON,
      height: UNDO_BUTTON,
      borderRadius: t.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.roles.surfaceInverse,
    },
    pressed: { opacity: t.opacity.disabled },
    struck: {
      ...t.type.label,
      color: t.roles.fgSecondary,
      textDecorationLine: 'line-through',
    },
    track: {
      position: 'absolute',
      left: t.spacing.xl,
      right: t.spacing.xl,
      bottom: t.spacing.md,
      height: TIMER_H,
      borderRadius: TIMER_H / 2,
      backgroundColor: t.roles.borderRim,
      overflow: 'hidden',
    },
    timer: { height: TIMER_H, backgroundColor: t.roles.fgPrimary },
  }));
  const fade = reduceMotion ? 0 : FADE_MS;
  return (
    <Animated.View
      entering={FadeIn.duration(fade)}
      exiting={FadeOut.duration(fade)}
      style={styles.undo}
      pointerEvents={shown ? 'box-none' : 'none'}
    >
      <Pressable
        onPress={onUndo}
        accessibilityRole="button"
        accessibilityLabel={`Undo deleting ${takeLabel}`}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        testID="passage-take-undo"
      >
        <UndoBold color={roles.fgOnInverse} size={controlSizes.icon24} />
      </Pressable>
      <Text style={styles.struck} numberOfLines={1}>
        {takeLabel}
      </Text>
      <View style={styles.track}>
        <Animated.View style={[styles.timer, timerStyle]} />
      </View>
    </Animated.View>
  );
}
