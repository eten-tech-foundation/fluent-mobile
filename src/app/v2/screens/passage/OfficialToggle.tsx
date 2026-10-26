import React from 'react';
import { Pressable } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { CheckBold } from '../../../../components/ui/icons';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';

/** Figma Official toggle: a 30pt circle. */
export const OFFICIAL_TOGGLE = 30;

/**
 * Marks the take official. One-way: another take can take it over, but
 * there's no un-marking, so it's a button, not a checkbox. On the official
 * (accent) card it fills with on-accent and the check zooms in.
 */
export function OfficialToggle({
  official,
  takeLabel,
  onPress,
}: {
  official: boolean;
  /** e.g. "Take 3", for TalkBack. */
  takeLabel: string;
  onPress: () => void;
}) {
  const { roles, controlSizes } = useTheme();
  const styles = useThemedStyles(t => ({
    toggle: {
      width: OFFICIAL_TOGGLE,
      height: OFFICIAL_TOGGLE,
      borderRadius: t.radius.full,
      borderWidth: t.stroke[2],
      borderColor: t.roles.fgSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    on: {
      borderColor: t.roles.fgOnAccent,
      backgroundColor: t.roles.fgOnAccent,
    },
  }));
  return (
    <Pressable
      onPress={onPress}
      disabled={official}
      accessibilityRole="button"
      accessibilityLabel={
        official
          ? `${takeLabel} is the official take`
          : `Make ${takeLabel} official`
      }
      accessibilityState={{ disabled: official }}
      hitSlop={9}
      style={[styles.toggle, official && styles.on]}
      testID="passage-take-official"
    >
      {official ? (
        <Animated.View entering={ZoomIn.springify()}>
          <CheckBold color={roles.accentPrimary} size={controlSizes.icon20} />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}
