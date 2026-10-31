import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme, useThemedStyles } from '../../theme/useTheme';

/** Figma Gap / Button: 52 tall. */
const BUTTON_HEIGHT = 52;

export interface DialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel: string;
  /** Also runs on Back and on a tap outside the dialog. */
  onCancel: () => void;
  testID?: string;
}

/**
 * A question over a scrim, in place of Android's Alert (Figma Gap / Dialog,
 * node 2644:72): a title, a line or two, then a primary and a quiet button
 * (Gap / Button, node 2644:16).
 */
export function Dialog({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  testID,
}: DialogProps) {
  const { motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = useThemedStyles(t => ({
    scrim: { backgroundColor: t.roles.shadowCast },
    centre: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: t.spacing.xxl + t.spacing.sm,
    },
    dialog: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.lg,
      boxShadow: t.elevation.floating,
      paddingTop: t.spacing.xxl,
      paddingHorizontal: t.spacing.xxl,
      paddingBottom: t.spacing.lg,
      gap: t.spacing.md,
    },
    title: { ...t.type.title, color: t.roles.fgPrimary },
    message: { ...t.type.body, color: t.roles.fgSecondary },
    actions: { paddingTop: t.spacing.md, gap: t.spacing.xs },
    button: {
      height: BUTTON_HEIGHT,
      borderRadius: t.radius.full,
      paddingHorizontal: t.spacing.xxl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: t.roles.surfaceInverse },
    primaryPressed: { backgroundColor: t.roles.surfaceInverseMuted },
    quietPressed: { backgroundColor: t.roles.surfaceDefault },
    primaryLabel: { ...t.type.title, color: t.roles.fgOnInverse },
    quietLabel: { ...t.type.title, color: t.roles.fgSecondary },
  }));

  // Stays mounted through the fade out; the Modal drops it after.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const timing = useMemo(() => {
    const { x1, y1, x2, y2 } = motion.easeStandard;
    return {
      duration: reduceMotion ? 0 : motion.releaseMs,
      easing: Easing.bezier(x1, y1, x2, y2),
    };
  }, [motion, reduceMotion]);

  useEffect(() => {
    if (visible) setMounted(true);
    progress.value = withTiming(visible ? 1 : 0, timing, finished => {
      'worklet';
      if (finished && !visible) scheduleOnRN(setMounted, false);
    });
  }, [visible, timing, progress]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, fadeStyle]}
      />
      {/* Not yet is TalkBack's way out, so the scrim stays out of its way. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onCancel}
        disabled={!visible}
        importantForAccessibility="no"
        testID={testID ? `${testID}-scrim` : undefined}
      />
      {/* Fading out, it's already answered: a second tap mustn't count. */}
      <View style={styles.centre} pointerEvents={visible ? 'box-none' : 'none'}>
        <Animated.View style={[styles.dialog, fadeStyle]} testID={testID}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              android_disableSound
              style={({ pressed }) => [
                styles.button,
                styles.primary,
                pressed && styles.primaryPressed,
              ]}
              testID={testID ? `${testID}-confirm` : undefined}
            >
              <Text style={styles.primaryLabel}>{confirmLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              android_disableSound
              style={({ pressed }) => [
                styles.button,
                pressed && styles.quietPressed,
              ]}
              testID={testID ? `${testID}-cancel` : undefined}
            >
              <Text style={styles.quietLabel}>{cancelLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
