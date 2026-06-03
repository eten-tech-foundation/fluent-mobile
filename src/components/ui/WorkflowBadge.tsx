import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Mic, UserCheck } from 'lucide-react-native';
import { WorkflowBadgeStage } from '../../types/db/types';
import {
  theme,
  iconSizes,
  lucideStrokeWidth,
  workflowBadges,
} from '../../theme';
import { getWorkflowStageLabel } from '../../utils/workflowStage';

interface WorkflowBadgeProps {
  stage: WorkflowBadgeStage;
}

const BADGE_ICONS = {
  draft: Mic,
  peer_check: UserCheck,
} as const;

export function WorkflowBadge({ stage }: WorkflowBadgeProps) {
  const colors = workflowBadges[stage];
  const Icon = BADGE_ICONS[stage];

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <Icon
        size={iconSizes.workflowBadge}
        color={colors.text}
        strokeWidth={lucideStrokeWidth}
      />
      <Text style={[styles.label, { color: colors.text }]}>
        {getWorkflowStageLabel(stage)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  label: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
  },
});
