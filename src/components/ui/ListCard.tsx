import React from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { theme } from '../../theme';
import { iconSizes } from '../../theme/iconSpecs';

interface ListCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListCard({
  children,
  onPress,
  showChevron = true,
  style,
}: ListCardProps) {
  const content = (
    <>
      <View style={styles.content}>{children}</View>
      {showChevron && (
        <ChevronRight
          size={iconSizes.chevron}
          color={theme.colors.mutedForeground}
          strokeWidth={2}
        />
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.7}
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
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  content: {
    flex: 1,
  },
});
