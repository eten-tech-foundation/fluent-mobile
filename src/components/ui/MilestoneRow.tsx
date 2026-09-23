import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MilestoneSummary } from '../../types/db/types';
import { formatMilestoneCount } from '../../utils/formatMilestoneCount';
import { ListCard } from './ListCard';
import { SyncIndicator } from './SyncIndicator';
import { theme } from '../../theme';

interface MilestoneRowProps {
  milestone: MilestoneSummary;
  onPress: () => void;
}

export function MilestoneRow({ milestone, onPress }: MilestoneRowProps) {
  return (
    <ListCard onPress={onPress} testID={`milestone-row-${milestone.id}`}>
      <View style={styles.column}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {milestone.name}
          </Text>
          <SyncIndicator syncState={milestone.syncState} />
        </View>
        <Text style={styles.subtitle}>
          {milestone.projectName} ·{' '}
          {formatMilestoneCount(milestone.milestoneCount)}
        </Text>
      </View>
    </ListCard>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: theme.spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  subtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
