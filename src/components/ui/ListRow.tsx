import React from 'react';
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme, useThemedStyles } from '../../theme/useTheme';
import { CaretRight, type NextIcon } from './icons';

/** Figma Gap / List row: 64 min height. */
const MIN_HEIGHT = 64;

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** A 24pt icon in fg/secondary. */
  icon?: NextIcon;
  /** In place of `icon`, e.g. an account's Avatar. */
  leading?: React.ReactNode;
  /** A chevron for rows that open a page, or a control like a Switch. */
  trailing?: 'chevron' | React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Spoken for the selected row in a choice, like the active account. */
  selected?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Settings and sheet rows (Figma Gap / List row, node 2644:51). Pressable
 * when given `onPress`; a row holding a control leaves the press to it.
 */
export function ListRow({
  title,
  subtitle,
  icon: Icon,
  leading,
  trailing,
  onPress,
  disabled = false,
  selected,
  accessibilityLabel,
  style,
  testID,
}: ListRowProps) {
  const { controlSizes, roles } = useTheme();
  const styles = useThemedStyles(t => ({
    row: {
      minHeight: MIN_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.lg,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      borderRadius: t.radius.lg,
    },
    pressed: { backgroundColor: t.roles.surfaceDefault },
    disabled: { opacity: t.opacity.disabled },
    text: { flex: 1, gap: t.spacing.xxs },
    title: { ...t.type.body, color: t.roles.fgPrimary },
    subtitle: { ...t.type.label, color: t.roles.fgSecondary },
  }));

  const content = (
    <>
      {leading ??
        (Icon ? (
          <Icon size={controlSizes.icon24} color={roles.fgSecondary} />
        ) : null)}
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing === 'chevron' ? (
        <CaretRight size={controlSizes.icon24} color={roles.fgInactive} />
      ) : (
        trailing
      )}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={[styles.row, disabled && styles.disabled, style]}
        testID={testID}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_disableSound
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)
      }
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}
