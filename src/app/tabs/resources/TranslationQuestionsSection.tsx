import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { TranslationQuestionAccordion } from './TranslationQuestionAccordion';
import { useTranslationQuestionsForUnit } from '../../../hooks/useTranslationQuestionsForUnit';
import { TRANSLATION_QUESTIONS_LOAD_ERROR } from '../../../constants/messages';
import { theme } from '../../../theme';

type TranslationQuestionsSectionProps = {
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /** Reset nested open state when the parent section collapses or unit changes. */
  sectionExpanded: boolean;
};

/**
 * Translation Questions body for the Resources tab (#190).
 * Nested Q→A accordions; section-scoped error + Retry.
 */
export function TranslationQuestionsSection({
  projectId,
  bookCode,
  chapterNumber,
  verseNumber,
  sectionExpanded,
}: TranslationQuestionsSectionProps) {
  const { state, retry } = useTranslationQuestionsForUnit({
    projectId,
    bookCode,
    chapterNumber,
    verseNumber,
  });
  const [openQuestionIds, setOpenQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setOpenQuestionIds(new Set());
  }, [bookCode, chapterNumber, verseNumber]);

  useEffect(() => {
    if (!sectionExpanded) {
      setOpenQuestionIds(new Set());
    }
  }, [sectionExpanded]);

  const handleToggle = useCallback((questionId: string) => {
    setOpenQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }, []);

  if (state.status === 'loading') {
    return (
      <View style={styles.centered} testID="translation-questions-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered} testID="translation-questions-error">
        <Text style={styles.errorMessage}>
          {TRANSLATION_QUESTIONS_LOAD_ERROR}
        </Text>
        <TouchableOpacity
          onPress={() => void retry()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading Translation Questions"
          testID="translation-questions-retry"
        >
          <Text style={styles.retryLink}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state.questions.length === 0) {
    return null;
  }

  return (
    <View style={styles.list} testID="translation-questions-list">
      {state.questions.map(item => (
        <TranslationQuestionAccordion
          key={item.id}
          question={item.question}
          answer={item.answer}
          expanded={openQuestionIds.has(item.id)}
          onToggle={() => handleToggle(item.id)}
          testID={`translation-question-${item.id}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.sm,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  errorMessage: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  retryLink: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
});
