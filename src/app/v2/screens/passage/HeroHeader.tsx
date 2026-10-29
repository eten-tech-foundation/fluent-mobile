import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import {
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ArrowDown, ArrowLeft } from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

/** Round button size; the centered title stays clear of the corners. */
const ROUND_BUTTON = 48;
const PRESSED_OPACITY = 0.7;
/** The ticker rests this long at the start of each pass. */
const TICKER_PAUSE_MS = 2000;
/** Points per second: slow enough to read as it goes. */
const TICKER_SPEED = 30;

/**
 * Back, the passage's title and Close. The title sits centered in the hero
 * and slides to the left edge as the player arrives; Back fades out and
 * Close fades in. A title too long for its room runs as a ticker, and
 * pressing it opens its sheet. Dragging the header closes the player.
 */
export function HeroHeader({
  title,
  top,
  progress,
  expanded,
  closeGesture,
  onLayout,
  onBack,
  onClose,
  onTitlePress,
}: {
  title: string;
  /** The status bar's height. */
  top: number;
  progress: SharedValue<number>;
  expanded: boolean;
  closeGesture: GestureType;
  /** The header's height and width, for the sheet's layout. */
  onLayout: (height: number, width: number) => void;
  onBack: () => void;
  onClose: () => void;
  /** Omit to turn pressing off, e.g. during a take. */
  onTitlePress?: () => void;
}) {
  const { spacing } = useTheme();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const [width, setWidth] = useState(0);
  const [titleWidth, setTitleWidth] = useState(0);
  const styles = useThemedStyles(t => ({
    header: {
      position: 'absolute',
      left: t.spacing.xl,
      right: t.spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingVertical: t.spacing.md,
    },
    corner: { position: 'absolute', top: t.spacing.md, right: 0 },
    titleSlot: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      justifyContent: 'center',
    },
    titlePress: { minHeight: ROUND_BUTTON, justifyContent: 'center' },
    pressed: { opacity: PRESSED_OPACITY },
    clip: { flexGrow: 0 },
    ticker: { flexDirection: 'row' },
    title: { ...t.type.overline, color: t.roles.fgPrimary },
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12], [1, 0], 'clamp'),
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.6, 1], [0, 1], 'clamp'),
  }));
  // Clear of Back and Close either side while it's centered.
  const titleMax = Math.max(0, width - 2 * (ROUND_BUTTON + spacing.md));
  const titleCenter = (width - Math.min(titleWidth, titleMax)) / 2;
  const titleReady = width > 0 && titleWidth > 0;
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleReady ? 1 : 0,
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0.3, 0.8],
          [titleCenter, 0],
          'clamp',
        ),
      },
    ],
  }));

  // One pass moves a copy into the title's place, so the loop doesn't jump.
  const ticks = !reduceMotion && titleMax > 0 && titleWidth > titleMax;
  const gap = 2 * spacing.xxl;
  const pass = titleWidth + gap;
  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = 0;
    if (!ticks || !focused) return;
    offset.value = withRepeat(
      withSequence(
        withDelay(
          TICKER_PAUSE_MS,
          withTiming(-pass, {
            duration: (pass / TICKER_SPEED) * 1000,
            easing: Easing.linear,
          }),
        ),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
    return () => cancelAnimation(offset);
  }, [ticks, focused, pass, offset]);
  const tickerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  const titleText = (
    <Text
      style={styles.title}
      numberOfLines={1}
      onLayout={e => setTitleWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {title}
    </Text>
  );

  return (
    <GestureDetector gesture={closeGesture}>
      <View
        style={[styles.header, { top }]}
        onLayout={e => {
          const { height, width: w } = e.nativeEvent.layout;
          setWidth(Math.round(w));
          onLayout(Math.round(height), Math.round(w));
        }}
        testID="passage-header"
      >
        <Animated.View
          style={backStyle}
          pointerEvents={expanded ? 'none' : 'auto'}
          importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
        >
          <RoundButton
            variant="flat"
            icon={ArrowLeft}
            accessibilityLabel="Back"
            onPress={onBack}
            testID="passage-back"
          />
        </Animated.View>
        <Animated.View
          style={[styles.titleSlot, { maxWidth: titleMax }, titleStyle]}
        >
          <Pressable
            onPress={onTitlePress}
            disabled={!onTitlePress}
            android_disableSound
            accessibilityRole="header"
            accessibilityLabel={
              onTitlePress ? `${title}. Show details.` : title
            }
            style={({ pressed }) => [
              styles.titlePress,
              pressed && styles.pressed,
            ]}
            testID="passage-title"
          >
            {reduceMotion ? (
              titleText
            ) : (
              // Lays the title out at its full width; the ticker moves it.
              // The press carries the title's label, so TalkBack skips this.
              <ScrollView
                horizontal
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                importantForAccessibility="no-hide-descendants"
                style={styles.clip}
              >
                <Animated.View
                  style={[styles.ticker, tickerStyle]}
                  testID="passage-title-ticker"
                >
                  {titleText}
                  {ticks ? (
                    <Text style={[styles.title, { marginLeft: gap }]}>
                      {title}
                    </Text>
                  ) : null}
                </Animated.View>
              </ScrollView>
            )}
          </Pressable>
        </Animated.View>
        <Animated.View
          style={[styles.corner, closeStyle]}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          {expanded ? (
            <RoundButton
              variant="flat"
              icon={ArrowDown}
              accessibilityLabel="Close the player"
              onPress={onClose}
              testID="passage-close"
            />
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
