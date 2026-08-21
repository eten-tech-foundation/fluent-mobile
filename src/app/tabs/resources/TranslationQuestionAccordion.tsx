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
import { theme, iconSizes, listIconStrokeWidth } from '../../../theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type TranslationQuestionAccordionProps = {
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
  testID?: string;
};

/**
 * Nested TQ accordion — answer hidden until expanded (#190).
 */
export function TranslationQuestionAccordion({
  question,
  answer,
  expanded,
  onToggle,
  testID,
}: TranslationQuestionAccordionProps) {
  const answerBody = answer.trim()
    ? answer
    : 'No answer available for this question.';

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
        accessibilityLabel={question}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Text style={styles.question}>{question}</Text>
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
          testID={testID ? `${testID}-answer` : undefined}
        >
          <Text style={styles.answer}>{answerBody}</Text>
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
  question: {
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
  answer: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    lineHeight: theme.typography.lineHeights.normal,
  },
});
