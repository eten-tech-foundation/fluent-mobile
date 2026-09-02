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
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type SourceTextAccordionProps = {
  expanded: boolean;
  onToggle: () => void;
  text?: string | null;
  /** Empty-copy when expanded with no verse text. */
  emptyMessage?: string;
  testID?: string;
};

/**
 * Collapsible source text for Record (Lovable View/Hide source text).
 * Renders at full height — scrolling is handled by the page-level
 * ScrollView in RecordTab, not an internal ScrollView (see #404).
 */
export function SourceTextAccordion({
  expanded,
  onToggle,
  text,
  emptyMessage = 'No source text for this verse yet.',
  testID = 'record-source-toggle',
}: SourceTextAccordionProps) {
  const body = text?.trim() ? text : emptyMessage;

  return (
    <View>
      <TouchableOpacity
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        style={styles.link}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide source text' : 'View source text'}
        testID={testID}
      >
        {expanded ? (
          <ChevronUp
            size={iconSizes.chevron}
            color={theme.colors.primary}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <ChevronDown
            size={iconSizes.chevron}
            color={theme.colors.primary}
            strokeWidth={listIconStrokeWidth}
          />
        )}
        <Text style={styles.linkLabel}>
          {expanded ? 'Hide source text' : 'View source text'}
        </Text>
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.body} testID="record-source-body">
          <Text style={styles.bodyText}>{body}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  linkLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.primary,
  },
  body: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.cardBackground,
    padding: theme.spacing.md,
  },
  bodyText: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
});
