import React from 'react';
import {
  BookOpen,
  Headphones,
  Mic,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DraftingTab } from '../../types/drafting/types';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

export type { DraftingTab };

interface DraftingTabBarProps {
  activeTab: DraftingTab;
  onTabChange: (tab: DraftingTab) => void;
}

/** Lovable drafting order: Bible → Resources → Record; active tab has top rule. */
const TABS: { id: DraftingTab; label: string; Icon: LucideIcon }[] = [
  { id: 'bible', label: 'Bible', Icon: Headphones },
  { id: 'resources', label: 'Resources', Icon: BookOpen },
  { id: 'record', label: 'Record', Icon: Mic },
];

export function DraftingTabBar({
  activeTab,
  onTabChange,
}: DraftingTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingBottom: insets.bottom }]}
      testID="drafting-tab-bar"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;

        return (
          <Pressable
            key={id}
            style={styles.tab}
            onPress={() => onTabChange(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            android_ripple={{ color: 'transparent' }}
          >
            {/* Stable top rule — avoid borderColor swap / margin overlap flicker. */}
            <View
              style={[
                styles.activeRule,
                isActive ? styles.activeRuleOn : styles.activeRuleOff,
              ]}
            />
            <Icon
              size={iconSizes.headerTab}
              color={
                isActive ? theme.colors.primary : theme.colors.mutedForeground
              }
              strokeWidth={listIconStrokeWidth}
            />
            <Text
              style={[
                styles.label,
                isActive ? styles.labelActive : styles.labelInactive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    // Lovable drafting tabs: `border-t border-border bg-card` (not pure white).
    backgroundColor: theme.colors.tabBarBackground,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.md + 2,
    paddingBottom: theme.spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  activeRule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  activeRuleOn: {
    backgroundColor: theme.colors.primary,
  },
  activeRuleOff: {
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
  },
  labelActive: {
    color: theme.colors.primary,
  },
  labelInactive: {
    color: theme.colors.mutedForeground,
  },
});
