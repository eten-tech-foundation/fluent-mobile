import React from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { ColorModeScope, useThemedStyles } from '../../../../theme/useTheme';

/**
 * The player's bottom: the take fan and the footer under the script (Canvas,
 * like the reading area above them) and the keys (Hardware). They rise in
 * together as the player opens, so they're one layer with one mode each.
 */
export function PlayerChrome({
  fan,
  fanShown = false,
  footer,
  keys,
  shown,
  style,
  onLayout,
}: {
  /** Floats over the script's faded end, above the footer. */
  fan?: React.ReactNode;
  /** The fan only takes touches and TalkBack focus while it's showing. */
  fanShown?: boolean;
  footer: React.ReactNode;
  keys: React.ReactNode;
  shown: boolean;
  style: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  /** The footer and keys only, without the fan's slot. */
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  return (
    <Animated.View
      style={[styles.chrome, style]}
      // The fan's slot is see-through, so touches there reach the script.
      pointerEvents={shown ? 'box-none' : 'none'}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      testID="passage-player"
    >
      <ColorModeScope value="canvas">
        {fan ? <FanSlot shown={fanShown}>{fan}</FanSlot> : null}
      </ColorModeScope>
      <View onLayout={onLayout}>
        <ColorModeScope value="canvas">{footer}</ColorModeScope>
        <ColorModeScope value="hardware">{keys}</ColorModeScope>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chrome: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

/**
 * Inside the chrome, over the script's faded end: Android only delivers a
 * touch inside the parent's bounds. See-through, so the rest reaches the
 * script.
 */
function FanSlot({
  shown,
  children,
}: {
  shown: boolean;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(t => ({
    // Above the footer's scrim, which dims everything else while a take
    // is lifted.
    slot: { paddingBottom: t.spacing.xs, zIndex: 1 },
  }));
  return (
    <View
      style={styles.slot}
      pointerEvents={shown ? 'box-none' : 'none'}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}
