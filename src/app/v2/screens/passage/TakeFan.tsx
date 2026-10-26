import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  FadeOut,
  ZoomIn,
} from 'react-native-reanimated';
import { CheckBold } from '../../../../components/ui/icons';
import { NEXT_SPRING } from '../../../../components/ui/motion';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

/** Figma Take fan (2555-743): the front take, then smaller ones behind. */
const TILE_W = 80;
const TILE_H = 72;
const SCALES = [1, 0.825, 0.7125, 0.6125, 0.5375];
/** How far each step out peeks past the one in front of it. */
const PEEKS = [43, 29, 20, 12];
const BADGE_ICON = 12;
/** The fan's own height, for laying it out above the take card. */
export const TAKE_FAN_HEIGHT = TILE_H + 8;

export interface FanTake {
  id: string;
  takeNumber: number;
  official: boolean;
  /** The chapter's picked take, which may not be the one in front. */
  selected?: boolean;
  /** The take being recorded now; drawn in front with a red edge. */
  recording?: boolean;
  /** Dashed slot where the next take lands; in front before the first. */
  placeholder?: boolean;
}

/** Where a tile sits `steps` from the front: its center x and scale. */
export function fanPlacement(steps: number) {
  const away = Math.abs(steps);
  if (away === 0) return { x: 0, scale: 1, visible: true };
  let edge = TILE_W / 2;
  let center = 0;
  for (let i = 1; i <= away; i += 1) {
    const width = TILE_W * (SCALES[i] ?? SCALES[SCALES.length - 1]);
    edge += PEEKS[i - 1] ?? 0;
    center = edge - width / 2;
  }
  return {
    x: Math.sign(steps) * center,
    scale: SCALES[away] ?? SCALES[SCALES.length - 1],
    visible: away < SCALES.length,
  };
}

/** Each step out lands this much later as the fan rises (ms). */
const RISE_STAGGER = 45;
/** How far the fan rises from behind the card. */
const RISE_FROM = 20;
/** A new take slides into the front from the right, by this share of a tile. */
const ARRIVE_FROM = 0.75;
/** The settle "click" when a take finishes recording. */
const CLICK_SCALE = 1.06;
const CLICK_MS = 90;
const COLOR_MS = 220;

/**
 * Takes as a fanned stack, as in Figma's Recorder: the selected take in
 * front, the rest stepping back either side, the official one blue. Tap a
 * take to bring it to the front. Tiles are keyed by take number, so the take
 * being recorded is the same tile that settles when it's saved.
 */
export function TakeFan({
  takes,
  frontId,
  visible = true,
  onSelect,
}: {
  takes: FanTake[];
  frontId: string | null;
  /** Rises from behind the take card, front tile first. */
  visible?: boolean;
  onSelect: (id: string) => void;
}) {
  const front = Math.max(
    0,
    takes.findIndex(t => t.id === frontId),
  );
  return (
    <View
      style={fanStyles.fan}
      pointerEvents="box-none"
      testID="passage-take-fan"
    >
      {takes.map((take, i) => (
        <Tile
          key={take.placeholder ? 'placeholder' : take.takeNumber}
          take={take}
          steps={i - front}
          front={i === front}
          shown={visible}
          onPress={() => onSelect(take.id)}
        />
      ))}
    </View>
  );
}

function Tile({
  take,
  steps,
  front,
  shown,
  onPress,
}: {
  take: FanTake;
  steps: number;
  front: boolean;
  shown: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { roles } = theme;
  const reduceMotion = useReducedMotion();
  const { x, scale, visible } = fanPlacement(steps);
  // A take that starts recording slides in from the right; others start
  // where they belong.
  const tx = useSharedValue(
    take.recording && !reduceMotion ? x + TILE_W * ARRIVE_FROM : x,
  );
  const sc = useSharedValue(scale);
  const op = useSharedValue(take.recording ? 0 : visible ? 1 : 0);
  const rise = useSharedValue(shown ? 1 : 0);
  const red = useSharedValue(take.recording ? 1 : 0);
  const blue = useSharedValue(take.official ? 1 : 0);
  const wasRecording = useRef(take.recording);

  useEffect(() => {
    const to = (v: number) =>
      reduceMotion
        ? withTiming(v, { duration: 0 })
        : withSpring(v, NEXT_SPRING);
    tx.value = to(x);
    op.value = withTiming(visible ? 1 : 0, {
      duration: reduceMotion ? 0 : theme.motion.releaseMs,
    });
    // Saved: a small settle, then on to its size.
    if (wasRecording.current && !take.recording && !reduceMotion) {
      sc.value = withSequence(
        withTiming(scale * CLICK_SCALE, { duration: CLICK_MS }),
        withSpring(scale, NEXT_SPRING),
      );
    } else {
      sc.value = to(scale);
    }
    wasRecording.current = take.recording;
  }, [
    x,
    scale,
    visible,
    take.recording,
    reduceMotion,
    tx,
    sc,
    op,
    theme.motion.releaseMs,
  ]);
  useEffect(() => {
    const to = shown ? 1 : 0;
    rise.value = reduceMotion
      ? to
      : withDelay(
          shown ? Math.abs(steps) * RISE_STAGGER : 0,
          withSpring(to, NEXT_SPRING),
        );
    // Only the fan showing or hiding staggers, not a change of front take.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, reduceMotion, rise]);
  useEffect(() => {
    const ms = reduceMotion ? 0 : COLOR_MS;
    red.value = withTiming(take.recording ? 1 : 0, { duration: ms });
    blue.value = withTiming(take.official ? 1 : 0, { duration: ms });
  }, [take.recording, take.official, reduceMotion, red, blue]);

  const baseFill = front ? roles.surfaceHighlight : roles.surfaceDefault;
  const baseEdge = front ? roles.fgSecondary : roles.borderRim;
  const style = useAnimatedStyle(() => ({
    opacity: op.value * rise.value,
    backgroundColor: take.placeholder
      ? roles.bgDefault
      : interpolateColor(blue.value, [0, 1], [baseFill, roles.accentPrimary]),
    borderColor: take.placeholder
      ? roles.fgSecondary
      : interpolateColor(
          red.value,
          [0, 1],
          [
            interpolateColor(
              blue.value,
              [0, 1],
              [baseEdge, roles.accentPrimary],
            ),
            roles.accentRecord,
          ],
        ),
    transform: [
      { translateX: tx.value },
      { translateY: (1 - rise.value) * RISE_FROM },
      { scale: sc.value },
    ],
  }));
  const styles = useThemedStyles(t => ({
    tile: {
      position: 'absolute',
      width: TILE_W,
      height: TILE_H,
      borderRadius: t.radius.sm,
      borderWidth: t.stroke[1],
      padding: t.spacing.sm,
    },
    front: { borderWidth: t.stroke[2] },
    // Set either way: Android keeps a dashed border once it's been drawn.
    solid: { borderStyle: 'solid' },
    placeholder: { borderStyle: 'dashed' },
    press: { flex: 1 },
    number: { ...t.type.title, color: t.roles.fgSecondary },
    numberFront: { color: t.roles.fgPrimary },
    numberOnAccent: { color: t.roles.fgOnAccent },
    badge: {
      position: 'absolute',
      right: t.spacing.xs,
      bottom: t.spacing.xs,
      width: t.controlSizes.icon20,
      height: t.controlSizes.icon20,
      borderRadius: t.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.roles.fgOnAccent,
    },
  }));
  const status = take.recording
    ? 'recording'
    : take.placeholder
    ? 'not recorded yet'
    : `${take.official ? 'official' : ''}${
        take.selected ? `${take.official ? ', ' : ''}selected` : ''
      }`;

  return (
    <Animated.View
      style={[
        styles.tile,
        front && styles.front,
        take.placeholder ? styles.placeholder : styles.solid,
        // The front take sits on top, then each step out behind it. zIndex
        // only: Android's elevation would also draw a drop shadow.
        { zIndex: 10 - Math.abs(steps) },
        style,
      ]}
      pointerEvents={visible && shown ? 'auto' : 'none'}
      exiting={
        take.placeholder
          ? FadeOut.duration(reduceMotion ? 0 : theme.motion.releaseMs)
          : undefined
      }
    >
      <Pressable
        onPress={onPress}
        disabled={take.recording || take.placeholder}
        // The empty slot is decoration, not a button that does nothing.
        importantForAccessibility={take.placeholder ? 'no' : 'auto'}
        accessibilityRole="button"
        accessibilityLabel={`Take ${take.takeNumber}${
          status ? `, ${status}` : ''
        }`}
        style={styles.press}
        testID={`passage-fan-${take.takeNumber}`}
      >
        {take.placeholder && !front ? null : (
          <Text
            style={[
              styles.number,
              front && styles.numberFront,
              take.official && styles.numberOnAccent,
            ]}
          >
            {take.takeNumber}
          </Text>
        )}
        {take.official ? (
          <Animated.View entering={ZoomIn.springify()} style={styles.badge}>
            <CheckBold color={roles.accentPrimary} size={BADGE_ICON} />
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const fanStyles = StyleSheet.create({
  fan: {
    height: TAKE_FAN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
