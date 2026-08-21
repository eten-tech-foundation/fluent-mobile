import React from 'react';
import { User, LucideIcon } from 'lucide-react-native';
import { theme, listIconStrokeWidth } from '../../theme';

type ChapterOwnershipVariant = 'mine' | 'other';

const VARIANTS: Record<
  ChapterOwnershipVariant,
  { Icon: LucideIcon; color: string; label: string }
> = {
  mine: {
    Icon: User,
    color: theme.colors.primary,
    label: 'Assigned to you',
  },
  other: {
    Icon: User,
    color: theme.colors.mutedForeground,
    label: 'Assigned to another translator',
  },
};

interface ChapterOwnershipIconProps {
  variant: ChapterOwnershipVariant;
  size: number;
}

export function ChapterOwnershipIcon({
  variant,
  size,
}: ChapterOwnershipIconProps) {
  const { Icon, color, label } = VARIANTS[variant];
  return (
    <Icon
      size={size}
      color={color}
      fill={color}
      strokeWidth={listIconStrokeWidth}
      accessibilityLabel={label}
    />
  );
}
