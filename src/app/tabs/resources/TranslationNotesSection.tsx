import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { TranslationNoteAccordion } from './TranslationNoteAccordion';
import type { TranslationNotesLoadState } from '../../../hooks/useTranslationNotesForUnit';
import { TRANSLATION_NOTES_LOAD_ERROR } from '../../../constants/messages';
import { theme } from '../../../theme';

type TranslationNotesSectionProps = {
  state: TranslationNotesLoadState | undefined;
  retry: () => void;
  /** Reset nested open state when the parent section collapses or unit changes. */
  sectionExpanded: boolean;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
};

/**
 * Translation Notes body for the Resources tab (#189).
 * Nested note accordions; section-scoped error + Retry.
 */
export function TranslationNotesSection({
  state,
  retry,
  sectionExpanded,
  bookCode,
  chapterNumber,
  verseNumber,
}: TranslationNotesSectionProps) {
  const [openNoteIds, setOpenNoteIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setOpenNoteIds(new Set());
  }, [bookCode, chapterNumber, verseNumber]);

  useEffect(() => {
    if (!sectionExpanded) {
      setOpenNoteIds(new Set());
    }
  }, [sectionExpanded]);

  const handleToggle = useCallback((noteId: string) => {
    setOpenNoteIds(prev => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }, []);

  if (!state || state.status === 'loading') {
    return (
      <View style={styles.centered} testID="translation-notes-loading">
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered} testID="translation-notes-error">
        <Text style={styles.errorMessage}>{TRANSLATION_NOTES_LOAD_ERROR}</Text>
        <TouchableOpacity
          onPress={() => void retry()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading Translation Notes"
          testID="translation-notes-retry"
        >
          <Text style={styles.retryLink}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state.status !== 'ready' || state.notes.length === 0) {
    return null;
  }

  return (
    <View style={styles.list} testID="translation-notes-list">
      {state.notes.map(note => (
        <TranslationNoteAccordion
          key={note.id}
          title={note.title}
          body={note.body}
          expanded={openNoteIds.has(note.id)}
          onToggle={() => handleToggle(note.id)}
          testID={`translation-note-${note.id}`}
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
