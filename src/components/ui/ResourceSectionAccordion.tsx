import React from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type ResourceSectionAccordionProps = {
  label: string;
  Icon: LucideIcon;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  testID?: string;
};

/**
 * Top-level Resources section accordion (Lovable card row).
 * Bodies for TN/TQ/Images land in #189–#191; this is chrome only.
 */
export function ResourceSectionAccordion({
  label,
  Icon,
  expanded,
  onToggle,
  children,
  testID,
}: ResourceSectionAccordionProps) {
  return (
    <View style={styles.card} testID={testID}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={label}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Icon
          size={iconSizes.headerTab}
          color={theme.colors.foreground}
          strokeWidth={listIconStrokeWidth}
        />
        <Text style={styles.label}>{label}</Text>
        {expanded ? (
          <ChevronUp
            size={iconSizes.chevron}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <ChevronDown
            size={iconSizes.chevron}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    minHeight: 52,
  },
  label: {
    flex: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  body: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
});
