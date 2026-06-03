import React from 'react';
import { CloudCheck, CloudUpload, LucideIcon } from 'lucide-react-native';
import { theme, listIconStrokeWidth } from '../../theme';

type RecordingCloudVariant = 'synced' | 'pending';

const VARIANTS: Record<
  RecordingCloudVariant,
  { Icon: LucideIcon; color: string; label: string }
> = {
  synced: {
    Icon: CloudCheck,
    color: theme.colors.syncSynced,
    label: 'Synced to cloud',
  },
  pending: {
    Icon: CloudUpload,
    color: theme.colors.syncUnsynced,
    label: 'On device only',
  },
};

interface RecordingCloudIconProps {
  variant: RecordingCloudVariant;
  size: number;
}

/** Cloud sync glyph shared by project and chapter list rows. */
export function RecordingCloudIcon({ variant, size }: RecordingCloudIconProps) {
  const { Icon, color, label } = VARIANTS[variant];
  return (
    <Icon
      size={size}
      color={color}
      strokeWidth={listIconStrokeWidth}
      accessibilityLabel={label}
    />
  );
}
