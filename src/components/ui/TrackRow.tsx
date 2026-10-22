import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { CheckBold, PauseFill, PlayFill } from './icons';
import { ProgressRing } from './ProgressRing';
import { RoundButton } from './RoundButton';
import { useTheme, useThemedStyles } from '../../theme/useTheme';

/** Rises with a little give, like a key coming up out of the surface. */
const RISE_SPRING = { damping: 16, stiffness: 260, mass: 1 };
/** How small the button starts as it grows out of the ring's center. */
const RISE_FROM = 0.6;
const UNHEARD_DOT = 8;

export type TrackRowState = 'idle' | 'playing' | 'paused';

export interface TrackRowProps {
  title: string;
  /** Under the title, e.g. the passage reference. */
  meta: string;
  /** 0–1 listened. */
  listened: number;
  /** Playing or paused makes this the live row, with its own button. */
  state?: TrackRowState;
  /** Opens the track, e.g. on its page in the player. */
  onPress?: () => void;
  /** Pauses or resumes the live row in place. */
  onToggle?: () => void;
  testID?: string;
}

/**
 * A listening track (Figma passage rows): title and meta, then how much is
 * heard. Only the live row gets a button, a Soft Round button that rises
 * out of its Progress ring and sinks back when it's done, so a list never
 * reads as a column of play buttons.
 */
export function TrackRow({
  title,
  meta,
  listened,
  state = 'idle',
  onPress,
  onToggle,
  testID,
}: TrackRowProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const live = state !== 'idle';
  // Kept mounted while it sinks, so it never just vanishes.
  const [showButton, setShowButton] = useState(live);
  const rise = useSharedValue(live ? 1 : 0);

  useEffect(() => {
    if (live) setShowButton(true);
    const done = (finished?: boolean) => {
      'worklet';
      if (finished && !live) scheduleOnRN(setShowButton, false);
    };
    rise.value = reduceMotion
      ? withTiming(live ? 1 : 0, { duration: theme.motion.releaseMs }, done)
      : withSpring(live ? 1 : 0, RISE_SPRING, done);
  }, [live, reduceMotion, rise, theme.motion.releaseMs]);

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: reduceMotion
      ? []
      : [{ scale: RISE_FROM + (1 - RISE_FROM) * rise.value }],
  }));
  const glyphStyle = useAnimatedStyle(() => ({ opacity: 1 - rise.value }));

  const styles = useThemedStyles(t => ({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingVertical: t.spacing.xs,
    },
    text: { flex: 1, gap: t.spacing.xxs },
    title: { ...t.type.body, color: t.roles.fgSecondary },
    titleLive: { color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
    layer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unheard: {
      width: UNHEARD_DOT,
      height: UNHEARD_DOT,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.accentPrimary,
    },
  }));

  const heard = listened >= 1;
  const status = live
    ? state === 'playing'
      ? 'playing'
      : 'paused'
    : heard
    ? 'heard'
    : listened > 0
    ? `${Math.round(listened * 100)}% heard`
    : 'not heard yet';

  return (
    <View style={styles.row} testID={testID}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${status}`}
        style={styles.text}
      >
        <Text style={[styles.title, live && styles.titleLive]}>{title}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </Pressable>
      <ProgressRing value={listened} accessibilityLabel={`${title} listened`}>
        <Pressable onPress={onPress} accessible={false} style={styles.layer}>
          <Animated.View style={glyphStyle}>
            {heard ? (
              <CheckBold
                color={theme.roles.accentPrimary}
                size={theme.controlSizes.icon24}
              />
            ) : listened === 0 ? (
              <View
                style={styles.unheard}
                testID={testID ? `${testID}-unheard` : undefined}
              />
            ) : null}
          </Animated.View>
        </Pressable>
        {showButton ? (
          <Animated.View style={buttonStyle}>
            <RoundButton
              icon={state === 'playing' ? PauseFill : PlayFill}
              accessibilityLabel={
                state === 'playing' ? `Pause ${title}` : `Play ${title}`
              }
              onPress={onToggle}
              testID={testID ? `${testID}-toggle` : undefined}
            />
          </Animated.View>
        ) : null}
      </ProgressRing>
    </View>
  );
}
