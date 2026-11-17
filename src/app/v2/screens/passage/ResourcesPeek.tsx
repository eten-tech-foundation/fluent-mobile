import React from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ListRow } from '../../../../components/ui/ListRow';
import { Books, CaretUp } from '../../../../components/ui/icons';
import {
  PASSAGE_RESOURCES_DETAIL,
  PASSAGE_RESOURCES_TITLE,
} from '../../../../constants/messages';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

/**
 * The passage's resources, peeking from the bottom of the page while the
 * player is closed. The page scrolls under it; a tap opens the Resources
 * sheet. No Figma frame yet: built from the List row and sheet surface.
 */
export function ResourcesPeek({
  shown,
  style,
  onPress,
  onLayout,
}: {
  shown: boolean;
  /** Fades it as the player opens. */
  style?: AnimatedStyle<ViewStyle>;
  onPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { controlSizes, roles } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(t => ({
    peek: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: t.spacing.sm,
      paddingHorizontal: t.spacing.sm,
      backgroundColor: t.roles.bgDefault,
      borderTopLeftRadius: t.radius.lg,
      borderTopRightRadius: t.radius.lg,
      boxShadow: t.elevation.floating,
    },
  }));
  return (
    <Animated.View
      style={[
        styles.peek,
        { paddingBottom: insets.bottom + styles.peek.paddingTop },
        style,
      ]}
      pointerEvents={shown ? 'box-none' : 'none'}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      onLayout={onLayout}
      testID="passage-resources-peek"
    >
      <ListRow
        title={PASSAGE_RESOURCES_TITLE}
        subtitle={PASSAGE_RESOURCES_DETAIL}
        icon={Books}
        trailing={
          <CaretUp size={controlSizes.icon24} color={roles.fgInactive} />
        }
        onPress={onPress}
        testID="passage-resources-open"
      />
    </Animated.View>
  );
}
