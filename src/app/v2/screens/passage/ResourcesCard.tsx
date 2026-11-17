import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Books, CaretDown } from '../../../../components/ui/icons';
import {
  ScreenHeader,
  useScrolled,
} from '../../../../components/ui/ScreenHeader';
import { NEXT_SPRING } from '../../../../components/ui/motion';
import {
  PASSAGE_IMAGES_TITLE,
  PASSAGE_RESOURCES_COLLAPSE,
  PASSAGE_RESOURCES_TITLE,
} from '../../../../constants/messages';
import { useHaptics } from '../../../../hooks/useHaptics';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { PassageImages } from './PassageImages';
import type { PassageImagesState } from './usePassageImages';

/** How far a drag goes before a release opens or closes it. */
const SNAP_AT = 0.35;
const FLING = 500;
/** Room to tap the chevron, whatever the text size. */
const MIN_TARGET = 48;
/** A preview tile's side: small enough to sit in line with the title. */
const TILE = 36;

/**
 * The passage's resources as a card docked at the bottom of the page, inset
 * from the sides. A tap or a flick up grows the card itself into the
 * resources, with no scrim; a flick down, its chevron or Back puts it back. It
 * sinks away while the player is open. No Figma frame yet.
 */
export function ResourcesCard({
  shown,
  open,
  onOpenChange,
  maxHeight,
  player,
  onPeekHeight,
  images,
  previews,
  onRetryImages,
}: {
  /** False while the player is open. */
  shown: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How tall it grows: up to just under the page's header. */
  maxHeight: number;
  /** The player's open progress, 0 to 1; the card sinks as it rises. */
  player: SharedValue<number>;
  /** The docked card's height, for the room the page leaves under it. */
  onPeekHeight: (height: number) => void;
  images: { state: PassageImagesState; scope: string };
  /** Up to three items shown in line while docked, to invite a look. */
  previews: ImagesMapsItem[];
  onRetryImages: () => void;
}) {
  const { controlSizes, roles } = useTheme();
  const haptics = useHaptics();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(t => ({
    card: {
      position: 'absolute',
      left: t.spacing.md,
      right: t.spacing.md,
      bottom: 0,
      backgroundColor: t.roles.bgDefault,
      borderTopLeftRadius: t.radius.lg,
      borderTopRightRadius: t.radius.lg,
      boxShadow: t.elevation.floating,
      overflow: 'hidden',
    },
    // Only the header's scroll stroke; the handle and row set their own room.
    header: {
      flexDirection: 'column',
      alignItems: 'stretch',
      justifyContent: 'flex-start',
      gap: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    handle: { alignItems: 'center', paddingTop: t.spacing.sm },
    grip: {
      width: 36,
      height: 4,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgInactive,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.sm,
      paddingBottom: t.spacing.lg,
    },
    tap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      // Tighter than a List row, so the icon reads as part of the title.
      gap: t.spacing.sm,
    },
    title: { ...t.type.body, color: t.roles.fgPrimary, flex: 1 },
    close: {
      width: MIN_TARGET,
      height: MIN_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: t.radius.full,
    },
    pressed: { backgroundColor: t.roles.surfaceDefault },
    slot: { justifyContent: 'center', alignItems: 'flex-end' },
    tiles: { flexDirection: 'row', gap: t.spacing.xs },
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.surfaceSunken,
    },
    closeSlot: { position: 'absolute', right: 0 },
    body: { flex: 1 },
    content: {
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.xxl,
      gap: t.spacing.sm,
    },
    heading: { ...t.type.title, color: t.roles.fgPrimary },
  }));

  const [header, setHeader] = useState(0);
  const { scrolled, onScroll, reset } = useScrolled();
  const list = useAnimatedRef<Animated.ScrollView>();
  // Each open starts at the top, while what's under the header is still faded.
  useEffect(() => {
    if (!open) return;
    list.current?.scrollTo({ y: 0, animated: false });
    reset();
  }, [open, list, reset]);
  // Docked, it shows its header above the system's gesture bar.
  const peek = header + insets.bottom;
  const travel = Math.max(0, maxHeight - peek);
  useEffect(() => {
    if (header > 0) onPeekHeight(peek);
  }, [header, peek, onPeekHeight]);
  const progress = useSharedValue(open ? 1 : 0);
  /** Where it's headed, so a flick's own spring isn't restarted. */
  const target = useRef(open);

  const animate = useCallback(
    (to: boolean, velocity = 0) => {
      target.current = to;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished && to) scheduleOnRN(haptics.press);
      };
      progress.value = reduceMotion
        ? withTiming(to ? 1 : 0, { duration: 0 }, done)
        : withSpring(to ? 1 : 0, { ...NEXT_SPRING, velocity }, done);
    },
    [progress, reduceMotion, haptics],
  );
  const settle = useCallback(
    (to: boolean, velocity: number) => {
      animate(to, velocity);
      if (to !== open) onOpenChange(to);
    },
    [animate, open, onOpenChange],
  );
  // Opened or closed from outside: a tap, Back, blur, the player.
  useEffect(() => {
    if (open !== target.current) animate(open);
  }, [open, animate]);

  const drag = Gesture.Pan()
    .enabled(shown && travel > 0)
    .activeOffsetY([-12, 12])
    .onUpdate(e => {
      const start = open ? 1 : 0;
      progress.value = Math.min(
        1,
        Math.max(0, start - e.translationY / travel),
      );
    })
    .onEnd(e => {
      const shouldOpen = open
        ? progress.value > 1 - SNAP_AT && e.velocityY < FLING
        : progress.value > SNAP_AT || e.velocityY < -FLING;
      scheduleOnRN(settle, shouldOpen, -e.velocityY / travel);
    });

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(player.value, [0, 0.25], [1, 0], 'clamp'),
    transform: [
      {
        translateY:
          (1 - progress.value) * travel +
          interpolate(player.value, [0, 0.4], [0, peek], 'clamp'),
      },
    ],
  }));
  // Docked, only the header shows; what's under it fades in as it grows.
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [0, 1], 'clamp'),
  }));
  // The previews give way to the chevron as it grows.
  const tilesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], 'clamp'),
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp'),
  }));

  return (
    <Animated.View
      style={[styles.card, { height: Math.max(maxHeight, peek) }, cardStyle]}
      pointerEvents={shown ? 'box-none' : 'none'}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      testID="passage-resources-peek"
    >
      <GestureDetector gesture={drag}>
        <View
          onLayout={e => setHeader(Math.round(e.nativeEvent.layout.height))}
        >
          <ScreenHeader
            scrolled={scrolled}
            style={styles.header}
            testID="passage-resources-header"
          >
            <View style={styles.handle}>
              <View style={styles.grip} />
            </View>
            <View style={styles.row}>
              <Pressable
                onPress={() => onOpenChange(!open)}
                android_disableSound
                accessibilityRole="button"
                accessibilityLabel={PASSAGE_RESOURCES_TITLE}
                accessibilityState={{ expanded: open }}
                style={styles.tap}
                testID="passage-resources-open"
              >
                <Books size={controlSizes.icon24} color={roles.fgSecondary} />
                <Text style={styles.title}>{PASSAGE_RESOURCES_TITLE}</Text>
              </Pressable>
              <View style={[styles.slot, { minWidth: MIN_TARGET }]}>
                {previews.length > 0 ? (
                  <Animated.View
                    style={[styles.tiles, tilesStyle]}
                    pointerEvents={open ? 'none' : 'auto'}
                    importantForAccessibility="no-hide-descendants"
                    testID="passage-resources-previews"
                  >
                    {previews.map(item => (
                      <Pressable
                        key={item.id}
                        onPress={() => onOpenChange(true)}
                        android_disableSound
                      >
                        <Image
                          source={{
                            uri: item.thumbnailUri?.trim() || item.uri,
                          }}
                          style={styles.tile}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      </Pressable>
                    ))}
                  </Animated.View>
                ) : null}
                <Animated.View
                  style={[styles.closeSlot, closeStyle]}
                  pointerEvents={open ? 'auto' : 'none'}
                  importantForAccessibility={
                    open ? 'auto' : 'no-hide-descendants'
                  }
                >
                  <Pressable
                    onPress={() => onOpenChange(false)}
                    android_disableSound
                    accessibilityRole="button"
                    accessibilityLabel={PASSAGE_RESOURCES_COLLAPSE}
                    style={({ pressed }) => [
                      styles.close,
                      pressed && styles.pressed,
                    ]}
                    testID="passage-resources-collapse"
                  >
                    <CaretDown
                      size={controlSizes.icon24}
                      color={roles.fgPrimary}
                    />
                  </Pressable>
                </Animated.View>
              </View>
            </View>
          </ScreenHeader>
        </View>
      </GestureDetector>
      <Animated.ScrollView
        ref={list}
        style={[styles.body, bodyStyle]}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={16}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        testID="passage-resources"
      >
        <Text style={styles.heading} accessibilityRole="header">
          {PASSAGE_IMAGES_TITLE}
        </Text>
        <PassageImages
          scope={images.scope}
          state={images.state}
          onRetry={onRetryImages}
        />
      </Animated.ScrollView>
    </Animated.View>
  );
}
