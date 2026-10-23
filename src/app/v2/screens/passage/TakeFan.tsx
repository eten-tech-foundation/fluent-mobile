import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
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
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import TrashOpen from '../../../../assets/icons/trash-open.svg';
import { CheckBold, UndoBold } from '../../../../components/ui/icons';
import { NEXT_SPRING } from '../../../../components/ui/motion';
import { useHaptics } from '../../../../hooks/useHaptics';
import { UNDO_MS } from '../../../../hooks/usePendingDelete';
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
  /** The take being recorded now; drawn in front with a red edge. */
  recording?: boolean;
  /** Dashed slot where the next take lands; in front before the first. */
  placeholder?: boolean;
  /** Dropped in the bin, with the undo window still open. */
  deleted?: boolean;
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
/** Hold this long to pick a take up (Q25). */
const LIFT_MS = 300;
/** Figma's dragging chip is 62 of 80 wide, whatever step it came from. */
const LIFT_SCALE = 0.775;
/** Figma's bin: 140 across, its center 202 above the front take's. */
const BIN = 140;
const BIN_RISE = 202;
const BIN_ICON_W = 60;
const BIN_ICON_H = 66;
/** A drop this close to the bin's edge still counts. */
const BIN_SLOP = 16;
/** Figma tints the lifted take accent/record at 22% over the bin (Q25). */
const OVER_TINT = 0.22;
const DROP_MS = 160;
/** Figma's deleted chip: undo badge and timer bar. */
const UNDO_BADGE = 28;
const UNDO_ICON = 14;
const TIMER_H = 3;

/**
 * Takes as a fanned stack, as in Figma's Recorder: the selected take in
 * front, the rest stepping back either side, the official one blue. Tap a
 * take to bring it to the front; hold and drag it to the bin to delete it.
 * Tiles are keyed by take number, so the take being recorded is the same
 * tile that settles when it's saved.
 */
export function TakeFan({
  takes,
  frontId,
  visible = true,
  onSelect,
  onDelete,
  onLiftChange,
}: {
  takes: FanTake[];
  frontId: string | null;
  /** Rises from behind the take card, front tile first. */
  visible?: boolean;
  /** A deleted take's tap is its undo. */
  onSelect: (id: string) => void;
  /** Omit to turn dragging off, e.g. during a take. */
  onDelete?: (id: string) => void;
  /** A take was picked up or put down, for dimming what's behind. */
  onLiftChange?: (lifted: boolean) => void;
}) {
  const { roles } = useTheme();
  const reduceMotion = useReducedMotion();
  const [lifted, setLifted] = useState(false);
  const show = useSharedValue(0);
  const over = useSharedValue(0);
  const styles = useThemedStyles(t => ({
    fan: {
      height: TAKE_FAN_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bin: {
      position: 'absolute',
      top: TAKE_FAN_HEIGHT / 2 - BIN_RISE - BIN / 2,
      width: BIN,
      height: BIN,
      borderRadius: t.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.roles.accentRecord,
    },
    // Figma's lighter dashed ring has no role; on-accent at 40% stands in.
    binRing: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: t.radius.full,
      borderWidth: t.stroke[2],
      borderStyle: 'dashed',
      borderColor: t.roles.fgOnAccent,
      opacity: t.opacity.disabled,
    },
  }));
  useEffect(() => {
    show.value = reduceMotion
      ? lifted
        ? 1
        : 0
      : withSpring(lifted ? 1 : 0, NEXT_SPRING);
    onLiftChange?.(lifted);
    // Report only when the lift changes, not when the callback does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifted, reduceMotion, show]);
  const binStyle = useAnimatedStyle(() => ({
    opacity: show.value,
    transform: [{ scale: (0.6 + 0.4 * show.value) * (1 + 0.08 * over.value) }],
  }));
  const front = Math.max(
    0,
    takes.findIndex(t => t.id === frontId),
  );
  return (
    <View style={styles.fan} pointerEvents="box-none" testID="passage-take-fan">
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={[styles.bin, binStyle]}
        testID="passage-bin"
      >
        <View style={styles.binRing} />
        <TrashOpen
          width={BIN_ICON_W}
          height={BIN_ICON_H}
          color={roles.fgOnAccent}
        />
      </Animated.View>
      {takes.map((take, i) => (
        <Tile
          key={take.placeholder ? 'placeholder' : take.takeNumber}
          take={take}
          steps={i - front}
          front={i === front}
          shown={visible}
          over={over}
          onPress={() => onSelect(take.id)}
          onDelete={
            onDelete &&
            visible &&
            !take.recording &&
            !take.placeholder &&
            !take.deleted
              ? () => onDelete(take.id)
              : undefined
          }
          onLift={setLifted}
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
  over,
  onPress,
  onDelete,
  onLift,
}: {
  take: FanTake;
  steps: number;
  front: boolean;
  shown: boolean;
  /** Shared across the fan: the lifted take is over the bin. */
  over: SharedValue<number>;
  onPress: () => void;
  onDelete?: () => void;
  onLift: (lifted: boolean) => void;
}) {
  const theme = useTheme();
  const { roles } = theme;
  const haptics = useHaptics();
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
  // Dragging: the finger's offset, the lift, and the fall into the bin.
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lift = useSharedValue(0);
  const drop = useSharedValue(0);
  const timer = useSharedValue(1);
  /** The finger is over the bin; `over` only animates the look of it. */
  const inBin = useSharedValue(0);
  const [lifted, setLifted] = useState(false);
  const liftedRef = useRef(false);
  const onLiftRef = useRef(onLift);
  onLiftRef.current = onLift;
  // A take removed mid-drag (a sync reload) mustn't leave the scrim up.
  useEffect(
    () => () => {
      if (liftedRef.current) onLiftRef.current(false);
    },
    [],
  );

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
    blue.value = withTiming(take.official && !take.deleted ? 1 : 0, {
      duration: ms,
    });
  }, [take.recording, take.official, take.deleted, reduceMotion, red, blue]);
  // Back from the bin as a dashed chip at its slot with its undo timer
  // running down, or back to a plain chip once undone.
  useEffect(() => {
    dragX.value = 0;
    dragY.value = 0;
    drop.value = reduceMotion
      ? 0
      : withTiming(0, { duration: theme.motion.releaseMs });
    if (take.deleted) {
      timer.value = 1;
      timer.value = reduceMotion
        ? 0
        : withTiming(0, { duration: UNDO_MS, easing: Easing.linear });
    }
  }, [
    take.deleted,
    reduceMotion,
    dragX,
    dragY,
    drop,
    timer,
    theme.motion.releaseMs,
  ]);

  const pickUp = () => {
    haptics.dragStart();
    liftedRef.current = true;
    setLifted(true);
    onLift(true);
  };
  const putDown = (into: boolean) => {
    haptics.dragEnd();
    liftedRef.current = false;
    setLifted(false);
    onLift(false);
    if (into) onDelete?.();
  };
  const reach = BIN / 2 + BIN_SLOP;
  const pressMs = reduceMotion ? 0 : theme.motion.pressMs;
  const dropMs = reduceMotion ? 0 : DROP_MS;
  const still = reduceMotion;
  const drag = Gesture.Pan()
    .enabled(onDelete !== undefined)
    .activateAfterLongPress(LIFT_MS)
    .onStart(() => {
      lift.value = still ? 1 : withSpring(1, NEXT_SPRING);
      scheduleOnRN(pickUp);
    })
    .onUpdate(e => {
      dragX.value = e.translationX;
      dragY.value = e.translationY;
      const dx = x + e.translationX;
      const dy = e.translationY + BIN_RISE;
      const inside = dx * dx + dy * dy < reach * reach ? 1 : 0;
      if (inside !== inBin.value) {
        inBin.value = inside;
        over.value = withTiming(inside, { duration: pressMs });
      }
    })
    .onEnd((e, success) => {
      // Decide from where the finger let go, not from the tint's animation.
      const dx = x + e.translationX;
      const dy = e.translationY + BIN_RISE;
      const into = success && dx * dx + dy * dy < reach * reach;
      inBin.value = 0;
      lift.value = still ? 0 : withSpring(0, NEXT_SPRING);
      if (into) {
        drop.value = withTiming(1, { duration: dropMs }, () => {
          over.value = 0;
          scheduleOnRN(putDown, true);
        });
        return;
      }
      over.value = 0;
      dragX.value = still ? 0 : withSpring(0, NEXT_SPRING);
      dragY.value = still ? 0 : withSpring(0, NEXT_SPRING);
      scheduleOnRN(putDown, false);
    });

  const focused = front || lifted;
  const baseFill = focused ? roles.surfaceHighlight : roles.surfaceDefault;
  const baseEdge = focused ? roles.fgSecondary : roles.borderRim;
  const flatFill = take.deleted
    ? roles.surfaceSunken
    : take.placeholder
    ? roles.bgDefault
    : null;
  const flatEdge =
    take.deleted || take.placeholder ? roles.borderHighlight : null;
  const style = useAnimatedStyle(() => {
    const resting = sc.value + (LIFT_SCALE - sc.value) * lift.value;
    return {
      opacity: op.value * rise.value * (1 - drop.value),
      backgroundColor:
        flatFill ??
        interpolateColor(blue.value, [0, 1], [baseFill, roles.accentPrimary]),
      borderColor:
        flatEdge ??
        interpolateColor(
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
        { translateX: tx.value + dragX.value },
        { translateY: (1 - rise.value) * RISE_FROM + dragY.value },
        { scale: resting * (1 - 0.6 * drop.value) },
      ],
    };
  });
  const tintStyle = useAnimatedStyle(() => ({
    opacity: over.value * lift.value * OVER_TINT,
  }));
  const timerStyle = useAnimatedStyle(() => ({
    width: `${timer.value * 100}%`,
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
    lifted: { zIndex: 20 },
    // Set either way: Android keeps a dashed border once it's been drawn.
    solid: { borderStyle: 'solid' },
    dashed: { borderStyle: 'dashed' },
    press: { flex: 1 },
    number: { ...t.type.title, color: t.roles.fgSecondary },
    numberFront: { color: t.roles.fgPrimary },
    numberOnAccent: { color: t.roles.fgOnAccent },
    numberDeleted: { color: t.roles.fgSecondary, opacity: t.opacity.disabled },
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
    // Figma's deleted chip: the badge sits 8 in from the right, the timer
    // runs along the bottom.
    undoBadge: {
      position: 'absolute',
      right: 0,
      bottom: t.spacing.xs,
      width: UNDO_BADGE,
      height: UNDO_BADGE,
      borderRadius: t.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.roles.surfaceInverse,
    },
    track: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: -t.spacing.xs,
      height: TIMER_H,
      borderRadius: TIMER_H / 2,
      backgroundColor: t.roles.borderHighlight,
      overflow: 'hidden',
    },
    timer: { height: TIMER_H, backgroundColor: t.roles.fgPrimary },
    tint: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.accentRecord,
    },
  }));
  const status = take.recording
    ? 'recording'
    : take.deleted
    ? 'deleted'
    : take.placeholder
    ? 'not recorded yet'
    : `${take.official ? 'official' : ''}${
        front ? `${take.official ? ', ' : ''}selected` : ''
      }`;

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={[
          styles.tile,
          front && styles.front,
          take.placeholder || take.deleted ? styles.dashed : styles.solid,
          // The front take sits on top, then each step out behind it; a
          // lifted take above them all. zIndex only: Android's elevation
          // would also draw a drop shadow.
          lifted ? styles.lifted : { zIndex: 10 - Math.abs(steps) },
          style,
        ]}
        pointerEvents={visible && shown ? 'auto' : 'none'}
        exiting={
          take.placeholder || take.deleted
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
          accessibilityHint={take.deleted ? 'Undoes the delete' : undefined}
          accessibilityActions={
            onDelete ? [{ name: 'delete', label: 'Delete' }] : undefined
          }
          onAccessibilityAction={e => {
            if (e.nativeEvent.actionName === 'delete') onDelete?.();
          }}
          style={styles.press}
          testID={`passage-fan-${take.takeNumber}`}
        >
          {take.placeholder && !front ? null : (
            <Text
              style={[
                styles.number,
                front && styles.numberFront,
                take.official && !take.deleted && styles.numberOnAccent,
                take.deleted && styles.numberDeleted,
              ]}
            >
              {take.takeNumber}
            </Text>
          )}
          {take.official && !take.deleted ? (
            <Animated.View entering={ZoomIn.springify()} style={styles.badge}>
              <CheckBold color={roles.accentPrimary} size={BADGE_ICON} />
            </Animated.View>
          ) : null}
          {take.deleted ? (
            <>
              <View style={styles.undoBadge}>
                <UndoBold color={roles.fgOnInverse} size={UNDO_ICON} />
              </View>
              <View style={styles.track}>
                <Animated.View style={[styles.timer, timerStyle]} />
              </View>
            </>
          ) : null}
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.tint, tintStyle]} />
      </Animated.View>
    </GestureDetector>
  );
}
