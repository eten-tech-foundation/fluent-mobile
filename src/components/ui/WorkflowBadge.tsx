import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WorkflowBadgeStage } from '../../types/db/types';
import { theme, workflowBadges } from '../../theme';
import { getWorkflowStageLabel } from '../../utils/workflowStage';

interface WorkflowBadgeProps {
  stage: WorkflowBadgeStage;
}

export function WorkflowBadge({ stage }: WorkflowBadgeProps) {
  const colors = workflowBadges[stage];

  return (
    <View
      style={[
        styles.badge,
        {
          borderColor: colors.border,
          backgroundColor: theme.colors.cardBackground,
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>
        {getWorkflowStageLabel(stage)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: theme.workflowBadge.borderWidth,
    paddingHorizontal: theme.workflowBadge.paddingHorizontal,
    paddingVertical: theme.workflowBadge.paddingVertical,
    borderRadius: theme.radius.full,
  },
  label: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
  },
});
