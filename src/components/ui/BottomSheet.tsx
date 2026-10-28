import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme, useThemedStyles } from '../../theme/useTheme';

/** Figma sheet handle: 40 × 4. */
const HANDLE_WIDTH = 40;
const HANDLE_HEIGHT = 4;
/** How far down, as a share of the sheet, a drag must go to close it. */
const CLOSE_AT = 0.3;
const FLING = 800;
/** Room above for the status bar and a glimpse of the screen it covers. */
const MAX_HEIGHT = '90%';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testID?: string;
}

/**
 * A sheet over a scrim (Figma Home · Accounts sheet, node 2646:185). It
 * slides up on bg/default; tapping the scrim, Back, or dragging it down
 * closes it.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: BottomSheetProps) {
  const { motion } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const styles = useThemedStyles(t => ({
    scrim: { backgroundColor: t.roles.shadowCast },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.roles.bgDefault,
      borderTopLeftRadius: t.radius.lg,
      borderTopRightRadius: t.radius.lg,
      boxShadow: t.elevation.floating,
      paddingTop: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      paddingBottom: t.spacing.xxl + t.spacing.sm,
      gap: t.spacing.sm,
      maxHeight: MAX_HEIGHT,
    },
    body: { flexGrow: 0, flexShrink: 1 },
    rows: { gap: t.spacing.sm },
    handleRow: { alignItems: 'center', paddingBottom: t.spacing.sm },
    handle: {
      width: HANDLE_WIDTH,
      height: HANDLE_HEIGHT,
      borderRadius: HANDLE_HEIGHT / 2,
      backgroundColor: t.roles.fgInactive,
    },
    title: {
      ...t.type.title,
      color: t.roles.fgPrimary,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.sm,
    },
  }));

  // Stays mounted through the closing slide; the Modal drops it after.
  const [mounted, setMounted] = useState(visible);
  const [height, setHeight] = useState<number | null>(null);
  const measured = height !== null;
  const travel = height ?? screenHeight;
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const timing = useMemo(() => {
    const { x1, y1, x2, y2 } = motion.easeStandard;
    return {
      duration: reduceMotion ? 0 : motion.releaseMs,
      easing: Easing.bezier(x1, y1, x2, y2),
    };
  }, [motion, reduceMotion]);

  useEffect(() => {
    if (!visible) return;
    setMounted(true);
    drag.value = 0;
  }, [visible, drag]);

  // The first open waits for the sheet's height, so it slides the whole way.
  useEffect(() => {
    if (visible && !measured) return;
    progress.value = withTiming(visible ? 1 : 0, timing, finished => {
      'worklet';
      if (finished && !visible) scheduleOnRN(setMounted, false);
    });
  }, [visible, measured, timing, progress]);

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    .onUpdate(e => {
      drag.value = Math.max(0, e.translationY);
    })
    .onEnd(e => {
      if (drag.value > travel * CLOSE_AT || e.velocityY > FLING) {
        scheduleOnRN(onClose);
      } else {
        drag.value = withTiming(0, timing);
      }
    });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel + drag.value }],
  }));

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID={testID ? `${testID}-scrim` : undefined}
        />
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: styles.sheet.paddingBottom + insets.bottom },
            sheetStyle,
          ]}
          onLayout={e => setHeight(e.nativeEvent.layout.height)}
          testID={testID}
        >
          {/* Only the top drags, so the rows below can scroll. */}
          <GestureDetector gesture={pan}>
            <View>
              <View style={styles.handleRow}>
                <View style={styles.handle} />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
            </View>
          </GestureDetector>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.rows}
            bounces={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
