import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Settings } from 'lucide-react-native';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme';

interface SettingsButtonProps {
  onPress: () => void;
}

export function SettingsButton({ onPress }: SettingsButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel="Settings"
      accessibilityRole="button"
      hitSlop={touchHitSlop}
      testID="home-settings-button"
    >
      <Settings
        size={iconSizes.header}
        color={theme.colors.primaryForeground}
        strokeWidth={listIconStrokeWidth}
      />
    </TouchableOpacity>
  );
}
