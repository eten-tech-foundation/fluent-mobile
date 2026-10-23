import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { ArrowDown, ArrowLeft } from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

/** Round button width; the centered title stays clear of the corners. */
const ROUND_BUTTON = 48;

/**
 * Back, the passage's title and Close. The title sits centered in the hero
 * and slides to the left edge as the player arrives; Back fades out and
 * Close fades in. Dragging the header closes the player.
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
}) {
  const { spacing } = useTheme();
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

  return (
    <GestureDetector gesture={closeGesture}>
      <View
        style={[styles.header, { top }]}
        onLayout={e => {
          const { height, width: w } = e.nativeEvent.layout;
          setWidth(Math.round(w));
          onLayout(Math.round(height), Math.round(w));
        }}
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
          pointerEvents="none"
        >
          <Text
            style={styles.title}
            numberOfLines={1}
            accessibilityRole="header"
            onLayout={e =>
              setTitleWidth(Math.round(e.nativeEvent.layout.width))
            }
          >
            {title}
          </Text>
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
