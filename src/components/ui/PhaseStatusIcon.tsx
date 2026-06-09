import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BadgeCheck,
  CircleCheck,
  Mic,
  UserCheck,
  UsersRound,
} from 'lucide-react-native';
import { WorkflowBadgeStage } from '../../types/db/types';
import { theme, workflowStages } from '../../theme';
import { iconSizes, phaseIconStrokeWidth } from '../../theme/iconSpecs';

interface PhaseStatusIconProps {
  stage: WorkflowBadgeStage;
}

const PHASE_ICONS = {
  mic: Mic,
  'user-check': UserCheck,
  'users-round': UsersRound,
  'badge-check': BadgeCheck,
  'circle-check': CircleCheck,
} as const;

export function PhaseStatusIcon({ stage }: PhaseStatusIconProps) {
  const config = workflowStages[stage];

  if (!config.phaseColor || !config.phaseTint || !config.phaseIcon) {
    return null;
  }

  const Icon = PHASE_ICONS[config.phaseIcon];

  return (
    <View
      style={[
        styles.circle,
        {
          borderColor: config.phaseColor,
          backgroundColor: config.phaseTint,
        },
      ]}
    >
      <Icon
        size={iconSizes.phaseIconGlyph}
        color={config.phaseColor}
        strokeWidth={phaseIconStrokeWidth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: iconSizes.phaseIcon,
    height: iconSizes.phaseIcon,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
