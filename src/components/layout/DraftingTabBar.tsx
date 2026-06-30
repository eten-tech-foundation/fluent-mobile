import React from 'react';
import { Headphones, Mic, LucideIcon } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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
            style={styles.tab}
            onPress={() => onTabChange(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
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
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
});
