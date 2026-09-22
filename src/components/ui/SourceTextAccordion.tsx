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
import { VerseRun, type VerseRunItem } from './VerseRun';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type SourceTextAccordionProps = {
  expanded: boolean;
  onToggle: () => void;
  verses?: VerseRunItem[] | null;
  /** Empty-copy when expanded with no verse text. */
  emptyMessage?: string;
  testID?: string;
};

export function SourceTextAccordion({
  expanded,
  onToggle,
  verses,
  emptyMessage = 'No source text for this verse yet.',
  testID = 'record-source-toggle',
}: SourceTextAccordionProps) {
  const hasText = Boolean(verses?.some(v => v.text?.trim()));

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
          {hasText ? (
            <VerseRun verses={verses!} />
          ) : (
            <Text style={styles.bodyText}>{emptyMessage}</Text>
          )}
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
