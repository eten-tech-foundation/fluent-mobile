import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Headphones, LucideIcon, Mic } from 'lucide-react-native';
import { theme } from '../../../theme';
import { iconSizes, listIconStrokeWidth } from '../../../theme/iconSpecs';

export type DraftingTab = 'bible' | 'record';

interface DraftingTabBarProps {
  activeTab: DraftingTab;
  onTabChange: (tab: DraftingTab) => void;
}

const TABS: { id: DraftingTab; label: string; Icon: LucideIcon }[] = [
  { id: 'bible', label: 'Bible', Icon: Headphones },
  { id: 'record', label: 'Record', Icon: Mic },
];

export function DraftingTabBar({
  activeTab,
  onTabChange,
}: DraftingTabBarProps) {
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
            accessibilityLabel={`${label} tab`}
            accessibilityState={{ selected: isActive }}
            testID={`drafting-tab-${id}`}
          >
            <Icon
              size={iconSizes.header}
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
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  activeTab: {
    borderTopColor: theme.colors.primary,
  },
  label: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
});
