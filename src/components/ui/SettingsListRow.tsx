import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

interface SettingsNavigationRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  disabledSubtitle?: string;
}

export function SettingsNavigationRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
  disabledSubtitle,
}: SettingsNavigationRowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <View style={styles.iconSlot}>{icon}</View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, disabled && styles.titleDisabled]}>
          {title}
        </Text>
        <Text style={styles.subtitle}>
          {disabled && disabledSubtitle ? disabledSubtitle : subtitle}
        </Text>
      </View>
      {!disabled && (
        <ChevronRight
          size={iconSizes.headerTab}
          color={theme.colors.mutedForeground}
          strokeWidth={listIconStrokeWidth}
        />
      )}
    </TouchableOpacity>
  );
}

interface SettingsToggleRowProps {
  icon?: React.ReactNode;
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
      {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
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
interface SettingsSegmentedRowProps<T extends string> {
  title: string;
  subtitle: string;
  options: { label: string; value: T }[];
  value: T;
  onValueChange: (value: T) => void;
}

export function SettingsSegmentedRow<T extends string>({
  title,
  subtitle,
  options,
  value,
  onValueChange,
}: SettingsSegmentedRowProps<T>) {
  return (
    <View style={styles.segmentedContainer}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.segmentedGroup}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.segmentedButton,
                selected && styles.segmentedButtonSelected,
              ]}
              onPress={() => onValueChange(option.value)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.segmentedButtonText,
                  selected && styles.segmentedButtonTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
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
  rowDisabled: {
    opacity: 0.5,
  },
  titleDisabled: {
    color: theme.colors.mutedForeground,
  },

  segmentedContainer: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  segmentedGroup: {
    flexDirection: 'row',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
    marginTop: theme.spacing.xs,
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderRadius: theme.radius.sm,
  },
  segmentedButtonSelected: {
    backgroundColor: theme.colors.background,
  },
  segmentedButtonText: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.mutedForeground,
    fontWeight: theme.typography.weights.medium,
  },
  segmentedButtonTextSelected: {
    color: theme.colors.foreground,
  },
});
