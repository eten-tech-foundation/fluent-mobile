import React from 'react';
import { TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme';

interface PageHeaderBackButtonProps {
  onPress: () => void;
}

export function PageHeaderBackButton({ onPress }: PageHeaderBackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={touchHitSlop}
    >
      <ChevronLeft
        size={iconSizes.header}
        color={theme.colors.primaryForeground}
        strokeWidth={listIconStrokeWidth}
      />
    </TouchableOpacity>
  );
}
