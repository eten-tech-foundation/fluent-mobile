import { StyleSheet, Text, View } from 'react-native';
import { WorkflowBadgeStage } from '../../types/db/types';
import { theme, workflowStages } from '../../theme';
import { getWorkflowStageLabel } from '../../utils/workflowStage';

interface WorkflowBadgeProps {
  stage: WorkflowBadgeStage;
}

export function WorkflowBadge({ stage }: WorkflowBadgeProps) {
  const { badgeBorder } = workflowStages[stage];

  return (
    <View
      style={[
        styles.badge,
        {
          borderColor: badgeBorder,
          backgroundColor: theme.colors.cardBackground,
        },
      ]}
    >
      <Text style={styles.label}>{getWorkflowStageLabel(stage)}</Text>
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
    color: theme.colors.foreground,
  },
});
