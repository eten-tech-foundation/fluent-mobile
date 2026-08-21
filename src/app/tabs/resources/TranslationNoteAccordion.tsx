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
import { TRANSLATION_NOTE_EMPTY_BODY } from '../../../constants/messages';
import { theme, iconSizes, listIconStrokeWidth } from '../../../theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type TranslationNoteAccordionProps = {
  title: string;
  body: string;
  expanded: boolean;
  onToggle: () => void;
  testID?: string;
};

/**
 * Nested TN accordion — body hidden until expanded (#189).
 */
export function TranslationNoteAccordion({
  title,
  body,
  expanded,
  onToggle,
  testID,
}: TranslationNoteAccordionProps) {
  const noteBody = body.trim() ? body : TRANSLATION_NOTE_EMPTY_BODY;

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
        accessibilityLabel={title}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Text style={styles.title}>{title}</Text>
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
      {expanded ? (
        <View
          style={styles.body}
          testID={testID ? `${testID}-body` : undefined}
        >
          <Text style={styles.bodyText}>{noteBody}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
    lineHeight: theme.typography.lineHeights.normal,
  },
  body: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  bodyText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    lineHeight: theme.typography.lineHeights.normal,
  },
});
