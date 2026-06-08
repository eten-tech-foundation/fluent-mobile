import React from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

interface ListCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function ListCard({
  children,
  onPress,
  showChevron = true,
  leading,
  style,
  contentStyle,
}: ListCardProps) {
  const content = (
    <>
      {leading}
      <View style={[styles.content, contentStyle]}>{children}</View>
      {showChevron && (
        <ChevronRight
          size={iconSizes.chevron}
          color={theme.colors.mutedForeground}
          strokeWidth={listIconStrokeWidth}
        />
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={theme.listCard.activeOpacity}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.card, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.listCard.backgroundColor,
    borderRadius: theme.listCard.borderRadius,
    borderWidth: 1,
    borderColor: theme.listCard.borderColor,
    paddingHorizontal: theme.listCard.paddingHorizontal,
    paddingVertical: theme.listCard.paddingVertical,
    gap: theme.listCard.gap,
  },
  content: {
    flex: 1,
  },
});
