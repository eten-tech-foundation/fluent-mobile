import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { CaretRight } from '../../../../components/ui/icons';
import {
  PASSAGE_QUESTION_HIDE_ANSWER,
  PASSAGE_QUESTION_SHOW_ANSWER,
  PASSAGE_QUESTIONS_EMPTY,
  PASSAGE_QUESTIONS_LOADING,
  PASSAGE_QUESTIONS_NO_TEXT,
  PASSAGE_QUESTIONS_RETRY,
  TRANSLATION_QUESTIONS_RETRY_LABEL,
  PASSAGE_QUESTIONS_TITLE,
  PASSAGE_QUESTIONS_UNPREPARED,
  TRANSLATION_QUESTION_NO_ANSWER,
  TRANSLATION_QUESTIONS_LOAD_ERROR,
} from '../../../../constants/messages';
import type { TranslationQuestionItem } from '../../../../types/resources/translationQuestions';
import { useTheme, useThemedStyles } from '../../../../theme/useTheme';
import type { PassageQuestionsState } from './usePassageQuestions';

/** Room to tap a question or Retry, whatever the text size. */
const MIN_TARGET = 48;
const PRESSED_OPACITY = 0.7;
const NONE: ReadonlySet<string> = new Set();

/**
 * The passage's Translation Questions, each opening on its answer. A failed
 * load stays here with its own Retry. Answers close with the sheet and when
 * the questions are for a different verse, passage, account or language.
 */
export function PassageQuestions({
  visible,
  scopeLabel,
  scope,
  state,
  onRetry,
  onClose,
}: {
  visible: boolean;
  /** e.g. "Verse 3" or the passage's reference. */
  scopeLabel: string;
  /** Changes whenever the questions are for something else. */
  scope: string;
  state: PassageQuestionsState;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { roles } = useTheme();
  const styles = useThemedStyles(t => ({
    scope: { ...t.type.label, color: t.roles.fgSecondary },
    message: { ...t.type.body, color: t.roles.fgSecondary },
    failed: { gap: t.spacing.sm, alignItems: 'flex-start' },
    retry: {
      minHeight: MIN_TARGET,
      justifyContent: 'center',
      paddingHorizontal: t.spacing.md,
      borderRadius: t.radius.sm,
      backgroundColor: t.roles.surfaceDefault,
    },
    retryText: { ...t.type.label, color: t.roles.accentPrimary },
    pressed: { opacity: PRESSED_OPACITY },
    loading: { minHeight: MIN_TARGET, justifyContent: 'center' },
    list: { gap: t.spacing.xs },
  }));
  const [open, setOpen] = useState<{ scope: string; ids: ReadonlySet<string> }>(
    { scope, ids: NONE },
  );
  useEffect(() => {
    if (!visible) setOpen({ scope, ids: NONE });
  }, [visible, scope]);
  const openIds = open.scope === scope ? open.ids : NONE;
  const toggle = (id: string) => {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen({ scope, ids: next });
  };

  let body: React.ReactNode;
  if (state.status === 'loading') {
    body = (
      <View
        style={styles.loading}
        accessible
        accessibilityLabel={PASSAGE_QUESTIONS_LOADING}
        testID="passage-questions-loading"
      >
        <ActivityIndicator color={roles.fgSecondary} />
      </View>
    );
  } else if (state.status === 'failed') {
    body = (
      <View style={styles.failed} testID="passage-questions-error">
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {TRANSLATION_QUESTIONS_LOAD_ERROR}
        </Text>
        <Pressable
          onPress={onRetry}
          android_disableSound
          accessibilityRole="button"
          accessibilityLabel={TRANSLATION_QUESTIONS_RETRY_LABEL}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          testID="passage-questions-retry"
        >
          <Text style={styles.retryText}>{PASSAGE_QUESTIONS_RETRY}</Text>
        </Pressable>
      </View>
    );
  } else if (state.status === 'noVerses') {
    body = (
      <Text style={styles.message} testID="passage-questions-no-text">
        {PASSAGE_QUESTIONS_NO_TEXT}
      </Text>
    );
  } else if (state.status === 'unprepared') {
    body = (
      <Text style={styles.message} testID="passage-questions-unprepared">
        {PASSAGE_QUESTIONS_UNPREPARED}
      </Text>
    );
  } else if (state.questions.length === 0) {
    body = (
      <Text style={styles.message} testID="passage-questions-empty">
        {PASSAGE_QUESTIONS_EMPTY}
      </Text>
    );
  } else {
    body = (
      <View style={styles.list} testID="passage-questions-list">
        {state.questions.map(item => (
          <QuestionRow
            key={item.id}
            item={item}
            expanded={openIds.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
      </View>
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={PASSAGE_QUESTIONS_TITLE}
      testID="passage-questions"
    >
      <Text style={styles.scope}>{scopeLabel}</Text>
      {body}
    </BottomSheet>
  );
}

function QuestionRow({
  item,
  expanded,
  onToggle,
}: {
  item: TranslationQuestionItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { controlSizes, roles } = useTheme();
  const styles = useThemedStyles(t => ({
    question: {
      minHeight: MIN_TARGET,
      flexDirection: 'row',
      borderRadius: t.radius.sm,
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingVertical: t.spacing.sm,
    },
    text: { ...t.type.body, color: t.roles.fgPrimary, flex: 1 },
    pressed: { backgroundColor: t.roles.surfaceDefault },
    caretClosed: { transform: [{ rotate: '90deg' }] },
    caretOpen: { transform: [{ rotate: '-90deg' }] },
    answer: {
      ...t.type.body,
      color: t.roles.fgSecondary,
      paddingBottom: t.spacing.sm,
    },
  }));
  const answer = item.answer.trim()
    ? item.answer
    : TRANSLATION_QUESTION_NO_ANSWER;
  return (
    <View testID={`passage-question-${item.id}`}>
      <Pressable
        onPress={onToggle}
        android_disableSound
        accessibilityRole="button"
        accessibilityLabel={item.question}
        accessibilityHint={
          expanded ? PASSAGE_QUESTION_HIDE_ANSWER : PASSAGE_QUESTION_SHOW_ANSWER
        }
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.question, pressed && styles.pressed]}
        testID={`passage-question-${item.id}-toggle`}
      >
        <Text style={styles.text}>{item.question}</Text>
        <View style={expanded ? styles.caretOpen : styles.caretClosed}>
          <CaretRight size={controlSizes.icon24} color={roles.fgSecondary} />
        </View>
      </Pressable>
      {expanded ? (
        <Text
          style={styles.answer}
          testID={`passage-question-${item.id}-answer`}
        >
          {answer}
        </Text>
      ) : null}
    </View>
  );
}
