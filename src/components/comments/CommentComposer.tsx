import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Mic, Send, Square } from 'lucide-react-native';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';
import {
  buildComposerSendPayload,
  isComposerDraftEmpty,
} from './commentPresentation';
import type { CommentSendPayload } from './types';

/** Presentation-only body emoji quick picks (not a product allow-list). */
export const COMMENT_BODY_EMOJI_PICKS = ['👍', '❤️', '🙏', '😊'] as const;

export type CommentComposerProps = {
  canCompose: boolean;
  isRecording: boolean;
  /** Parent-owned provisional clip URI while recording session is active. */
  recordedAudioUri: string | null;
  onRecordStart: () => void;
  onRecordStop: () => void;
  /**
   * Resolves `true` on accepted send (clear draft). `false` / reject keeps
   * the draft (failure or capability gate). Sync `void` is treated as success
   * for uncontrolled callers.
   */
  onSend: (
    payload: CommentSendPayload,
  ) => void | boolean | Promise<boolean | void>;
  /** Clear parent-owned audio clip (text/emoji XOR audio). */
  onClearAudio?: () => void;
  /** Optional surface-owned draft so dismiss can preserve text/emoji. */
  text?: string;
  onTextChange?: (text: string) => void;
  bodyEmoji?: string | null;
  onBodyEmojiChange?: (emoji: string | null) => void;
  testID?: string;
};

/**
 * Controlled text / audio / emoji-only composer. Mic beside the text field.
 * Recording and persistence are parent callbacks — no live device claim here.
 * Modalities are mutually exclusive to match API459 wire CHECKs.
 */
export function CommentComposer({
  canCompose,
  isRecording,
  recordedAudioUri,
  onRecordStart,
  onRecordStop,
  onSend,
  onClearAudio,
  text: controlledText,
  onTextChange,
  bodyEmoji: controlledBodyEmoji,
  onBodyEmojiChange,
  testID = 'comment-composer',
}: CommentComposerProps) {
  const isTextControlled = onTextChange !== undefined;
  const isEmojiControlled = onBodyEmojiChange !== undefined;
  const [localText, setLocalText] = useState('');
  const [localBodyEmoji, setLocalBodyEmoji] = useState<string | null>(null);

  const text = isTextControlled ? controlledText ?? '' : localText;
  const bodyEmoji = isEmojiControlled
    ? controlledBodyEmoji ?? null
    : localBodyEmoji;

  const setText = (next: string) => {
    if (isTextControlled) {
      onTextChange?.(next);
    } else {
      setLocalText(next);
    }
  };
  const setBodyEmoji = (next: string | null) => {
    if (isEmojiControlled) {
      onBodyEmojiChange?.(next);
    } else {
      setLocalBodyEmoji(next);
    }
  };

  const draft = useMemo(
    () => ({
      text,
      bodyEmoji,
      audioUri: recordedAudioUri,
    }),
    [text, bodyEmoji, recordedAudioUri],
  );
  const empty = isComposerDraftEmpty(draft);

  // Audio clip present → drop conflicting text/emoji (API459 XOR).
  useEffect(() => {
    if (recordedAudioUri === null) {
      return;
    }
    if (isTextControlled) {
      onTextChange?.('');
    } else {
      setLocalText('');
    }
    if (isEmojiControlled) {
      onBodyEmojiChange?.(null);
    } else {
      setLocalBodyEmoji(null);
    }
  }, [
    recordedAudioUri,
    isTextControlled,
    isEmojiControlled,
    onTextChange,
    onBodyEmojiChange,
  ]);

  const handleTextChange = (next: string) => {
    if (next.trim().length > 0) {
      if (bodyEmoji !== null) {
        setBodyEmoji(null);
      }
      if (recordedAudioUri !== null) {
        onClearAudio?.();
      }
    }
    setText(next);
  };

  const handleBodyEmojiPress = (emoji: string) => {
    const selected = bodyEmoji === emoji;
    if (selected) {
      setBodyEmoji(null);
      return;
    }
    setText('');
    if (recordedAudioUri !== null) {
      onClearAudio?.();
    }
    setBodyEmoji(emoji);
  };

  const handleRecordPress = () => {
    if (isRecording) {
      onRecordStop();
      return;
    }
    setText('');
    setBodyEmoji(null);
    onRecordStart();
  };

  const handleSend = () => {
    if (!canCompose) return;
    const payload = buildComposerSendPayload(draft);
    if (!payload) return;
    void (async () => {
      const result = await onSend(payload);
      if (result === false) {
        // Failure / gate — keep draft (including parent audio).
        return;
      }
      if (!isTextControlled) {
        setLocalText('');
      }
      if (!isEmojiControlled) {
        setLocalBodyEmoji(null);
      }
      // Controlled draft + audio cleared by surface on success.
    })();
  };

  if (!canCompose) {
    return (
      <View style={styles.readOnly} testID={`${testID}-readonly`}>
        <Text style={styles.readOnlyText}>Comments are read-only</Text>
      </View>
    );
  }

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.emojiRow} testID={`${testID}-emoji-picks`}>
        {COMMENT_BODY_EMOJI_PICKS.map(emoji => {
          const selected = bodyEmoji === emoji;
          return (
            <TouchableOpacity
              key={emoji}
              onPress={() => handleBodyEmojiPress(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`Body emoji ${emoji}`}
              accessibilityState={{ selected }}
              testID={`${testID}-body-emoji-${emoji}`}
              style={[styles.emojiChip, selected && styles.emojiChipSelected]}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={handleRecordPress}
          accessibilityRole="button"
          accessibilityLabel={
            isRecording
              ? 'Stop recording comment audio'
              : 'Record comment audio'
          }
          testID={
            isRecording ? `${testID}-record-stop` : `${testID}-record-start`
          }
          style={[styles.micButton, isRecording && styles.micButtonActive]}
        >
          {isRecording ? (
            <Square
              size={iconSizes.headerTab}
              color={theme.colors.primaryForeground}
              strokeWidth={listIconStrokeWidth}
            />
          ) : (
            <Mic
              size={iconSizes.headerTab}
              color={theme.colors.primaryForeground}
              strokeWidth={listIconStrokeWidth}
            />
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          placeholder="Add a comment"
          placeholderTextColor={theme.colors.mutedForeground}
          editable={!isRecording && recordedAudioUri === null}
          multiline
          testID={`${testID}-text`}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={empty || isRecording}
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          accessibilityState={{ disabled: empty || isRecording }}
          testID={`${testID}-send`}
          style={[
            styles.sendButton,
            (empty || isRecording) && styles.sendDisabled,
          ]}
        >
          <Send
            size={iconSizes.headerTab}
            color={theme.colors.primaryForeground}
            strokeWidth={listIconStrokeWidth}
          />
        </TouchableOpacity>
      </View>
      {recordedAudioUri !== null ? (
        <Text style={styles.audioHint} testID={`${testID}-audio-ready`}>
          Audio clip ready
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  readOnly: {
    paddingVertical: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  readOnlyText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  emojiChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cardBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  emojiChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  emojiText: {
    fontSize: theme.typography.sizes.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  micButtonActive: {
    backgroundColor: theme.colors.destructive,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  audioHint: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
});
