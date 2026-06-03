import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BookOpen, ListChecks } from 'lucide-react-native';
import { theme } from '../../theme';
import { iconSizes } from '../../theme/iconSpecs';

export type HomeTab = 'myWork' | 'projects';

interface TabBarProps {
  activeTab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
}

const TABS: {
  id: HomeTab;
  label: string;
  Icon: typeof BookOpen;
}[] = [
  { id: 'projects', label: 'Projects', Icon: BookOpen },
  { id: 'myWork', label: 'My Work', Icon: ListChecks },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <View style={styles.container}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        const color = isActive
          ? theme.colors.primary
          : theme.colors.tabInactive;
        const { Icon } = tab;

        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, isActive && styles.activeTab]}
            onPress={() => onTabChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Icon size={iconSizes.headerTab} color={color} strokeWidth={2} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.primary,
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
});
