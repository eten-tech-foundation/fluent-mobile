import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  PASSAGE_NOTES_EMPTY,
  PASSAGE_NOTES_LOADING,
  PASSAGE_NOTES_OFFLINE,
  PASSAGE_NOTES_PARTIAL,
  PASSAGE_NOTES_RETRYING,
  TRANSLATION_NOTES_LOAD_ERROR,
} from '../../../../constants/messages';
import { touchHitSlop } from '../../../../theme/iconSpecs';
import { useThemedStyles } from '../../../../theme/useTheme';
import type { PassageNotesStatus } from './usePassageNotes';

const MESSAGE: Record<PassageNotesStatus, string | null> = {
  idle: null,
  complete: null,
  loading: PASSAGE_NOTES_LOADING,
  retrying: PASSAGE_NOTES_RETRYING,
  empty: PASSAGE_NOTES_EMPTY,
  partial: PASSAGE_NOTES_PARTIAL,
  offline: PASSAGE_NOTES_OFFLINE,
  failed: TRANSLATION_NOTES_LOAD_ERROR,
};

/** Whether there's anything to say; a complete load speaks through its notes. */
export function hasNotesStatus(status: PassageNotesStatus): boolean {
  return MESSAGE[status] !== null;
}

/**
 * One line under Listen's waveform on how the notes load went, so a failure
 * doesn't read as a passage with no notes. Retry stays put, busy, while it
 * tries again; nothing else in the player waits on it.
 */
export function NotesStatus({
  status,
  onRetry,
}: {
  status: PassageNotesStatus;
  onRetry: () => void;
}) {
  const styles = useThemedStyles(t => ({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      columnGap: t.spacing.sm,
    },
    message: {
      ...t.type.meta,
      color: t.roles.fgPrimary,
      textAlign: 'center',
    },
    retry: { ...t.type.meta, color: t.roles.accentPrimary },
    busy: { color: t.roles.fgInactive },
  }));
  const message = MESSAGE[status];
  if (message === null) return null;
  const retrying = status === 'retrying';
  const canRetry = status === 'failed' || status === 'partial' || retrying;
  return (
    <View style={styles.row} testID="passage-notes-status">
      <Text
        style={styles.message}
        accessibilityLiveRegion="polite"
        testID="passage-notes-status-message"
      >
        {message}
      </Text>
      {canRetry ? (
        <Pressable
          onPress={onRetry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel={
            retrying
              ? 'Retrying translation notes'
              : 'Retry loading translation notes'
          }
          accessibilityState={{ disabled: retrying, busy: retrying }}
          hitSlop={touchHitSlop}
          testID="passage-notes-retry"
        >
          <Text style={[styles.retry, retrying && styles.busy]}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
