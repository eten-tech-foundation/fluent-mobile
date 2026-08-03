import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import {
  PrepareOfflineResourceGroup,
  PrepareOfflineResourceTier,
} from '../../types/prepareOffline/types';
import {
  isItemCustomizeLocked,
  isTierLocked,
} from '../../utils/prepareOfflineCatalog';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { ResourceGroupDivider } from './ResourceGroupDivider';
import { ResourceItemRow } from './ResourceItemRow';

const TIER_LABELS: Record<PrepareOfflineResourceTier, string> = {
  1: 'TIER 1 — REQUIRED',
  2: 'TIER 2 — RECOMMENDED',
  3: 'TIER 3 — OPTIONAL',
};

interface ResourceTierHeaderProps {
  tier: PrepareOfflineResourceTier;
}

export function ResourceTierHeader({ tier }: ResourceTierHeaderProps) {
  return (
    <View style={styles.tierHeader} testID={`resource-tier-${tier}`}>
      <Text style={styles.tierLabel}>{TIER_LABELS[tier]}</Text>
      {tier === 1 ? (
        <Lock
          size={iconSizes.chapterSync}
          color={theme.colors.mutedForeground}
          strokeWidth={listIconStrokeWidth}
          testID="tier-lock-icon"
        />
      ) : null}
    </View>
  );
}

interface ResourceCustomizeGroupProps {
  group: PrepareOfflineResourceGroup;
  isItemSelected: (itemId: string) => boolean;
  onToggleItem: (itemId: string) => void;
}

function ResourceCustomizeGroup({
  group,
  isItemSelected,
  onToggleItem,
}: ResourceCustomizeGroupProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupName}>{group.groupName}</Text>
      {group.items.map(item => {
        const customizeLocked = isItemCustomizeLocked(item);

        return (
          <ResourceItemRow
            key={item.id}
            item={item}
            mode="customize"
            selected={isItemSelected(item.id)}
            locked={customizeLocked}
            showTierLock={isTierLocked(item.tier)}
            onToggle={() => onToggleItem(item.id)}
          />
        );
      })}
    </View>
  );
}

interface CustomizeDownloadGroupListProps {
  groups: PrepareOfflineResourceGroup[];
  isItemSelected: (itemId: string) => boolean;
  onToggleItem: (itemId: string) => void;
}

export function CustomizeDownloadGroupList({
  groups,
  isItemSelected,
  onToggleItem,
}: CustomizeDownloadGroupListProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <View style={styles.section} testID="customize-download-group-list">
      {groups.map((group, index) => {
        const tier = group.items[0]?.tier;
        if (!tier) {
          return null;
        }

        const previousTier =
          index > 0 ? groups[index - 1]?.items[0]?.tier : undefined;
        const showTierHeader = tier !== previousTier;

        return (
          <React.Fragment key={group.groupName}>
            {index > 0 ? <ResourceGroupDivider /> : null}
            {showTierHeader ? <ResourceTierHeader tier={tier} /> : null}
            <ResourceCustomizeGroup
              group={group}
              isItemSelected={isItemSelected}
              onToggleItem={onToggleItem}
            />
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.sm,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
    letterSpacing: 0.4,
  },
  group: {
    gap: theme.spacing.xs,
    paddingLeft: theme.spacing.xs,
  },
  groupName: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
});
