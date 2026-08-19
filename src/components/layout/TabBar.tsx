import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BookOpen, ListChecks, LucideIcon } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

export type HomeTab = 'myWork' | 'projects';

interface TabBarProps {
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
}

const TABS: { id: HomeTab; label: string; Icon: LucideIcon }[] = [
  { id: 'projects', label: 'Projects', Icon: BookOpen },
  { id: 'myWork', label: 'My Work', Icon: ListChecks },
];

const TAB_INDICATOR = 2;

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <View style={styles.container}>
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        const color = isActive
          ? theme.colors.primary
          : theme.colors.mutedForeground;

        return (
          <TouchableOpacity
            key={id}
            style={[styles.tab, isActive && styles.activeTab]}
            onPress={() => onTabChange(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Icon
              size={iconSizes.headerTab}
              color={color}
              strokeWidth={listIconStrokeWidth}
            />
            <Text style={[styles.label, { color }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.tabBarBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    // Bottom indicator sits inside the box — pad extra below so content stays centered.
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md + TAB_INDICATOR,
    borderBottomWidth: TAB_INDICATOR,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    includeFontPadding: false,
  },
});
