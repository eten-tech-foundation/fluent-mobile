import React from 'react';
import {
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { ColorModeScope } from '../../../../theme/useTheme';

/**
 * The player's bottom: the footer under the script (Canvas, like the reading
 * area above it) and the keys (Hardware). They rise in together as the
 * player opens, so they're one layer with one mode each.
 */
export function PlayerChrome({
  footer,
  keys,
  shown,
  style,
  onLayout,
}: {
  footer: React.ReactNode;
  keys: React.ReactNode;
  shown: boolean;
  style: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  return (
    <Animated.View
      style={[styles.chrome, style]}
      pointerEvents={shown ? 'auto' : 'none'}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      onLayout={onLayout}
      testID="passage-player"
    >
      <ColorModeScope value="canvas">{footer}</ColorModeScope>
      <ColorModeScope value="hardware">{keys}</ColorModeScope>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chrome: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
