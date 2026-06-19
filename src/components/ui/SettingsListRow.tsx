import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

interface SettingsNavigationRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}

export function SettingsNavigationRow({
  icon,
  title,
  subtitle,
  onPress,
}: SettingsNavigationRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={styles.iconSlot}>{icon}</View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <ChevronRight
        size={iconSizes.headerTab}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
      />
    </TouchableOpacity>
  );
}

interface SettingsToggleRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function SettingsToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
}: SettingsToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.iconSlot}>{icon}</View>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme.colors.border,
          true: theme.colors.primary,
        }}
        thumbColor={theme.colors.primaryForeground}
        accessibilityLabel={title}
      />
    </View>
  );
}

interface SettingsDestructiveRowProps {
  icon: React.ReactNode;
  title: string;
  onPress: () => void;
}

export function SettingsDestructiveRow({
  icon,
  title,
  onPress,
}: SettingsDestructiveRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={styles.iconSlot}>{icon}</View>
      <Text style={styles.destructiveTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  iconSlot: {
    width: iconSizes.headerTab,
    alignItems: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  destructiveTitle: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    color: theme.colors.destructive,
  },
});
