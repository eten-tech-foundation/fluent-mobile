import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { CommentComposer } from './CommentComposer';
import type { OrderedComment } from './commentPresentation';
import { CommentThreadList } from './CommentThreadList';
import { shouldDismissCommentDrawerDrag } from './commentDrawerDismiss';
import type {
  CommentReactionRequest,
  CommentReplyRootId,
  CommentSendPayload,
} from './types';

export type CommentDrawerProps = {
  visible: boolean;
  onDismiss: () => void;
  /** PROVISIONAL presentation items (+ sortKey). Not live thread API records. */
  comments: OrderedComment[];
  canCompose: boolean;
  canReact: boolean;
  isRecording: boolean;
  recordedAudioUri: string | null;
  playingCommentId: string | null;
  onRecordStart: () => void;
  onRecordStop: () => void;
  onSend: (
    payload: CommentSendPayload,
  ) => void | boolean | Promise<boolean | void>;
  /** Always receives the root comment id (reply flatten). */
  onReply: (rootCommentId: CommentReplyRootId) => void;
  onReaction: (request: CommentReactionRequest) => void;
  /**
   * Parent / `useCommentPlaybackAdapter` wires verified playback. This drawer
   * only forwards the controlled play/pause request — no second engine.
   */
  onPlayPauseCommentAudio: (commentId: string, audioUri: string) => void;
  /** When set, composer is in reply mode (presentation hint only). */
  replyToRootId?: CommentReplyRootId | null;
  onClearAudio?: () => void;
  /** Surface-owned draft fields (preserve across dismiss). */
  composerText?: string;
  onComposerTextChange?: (text: string) => void;
  composerBodyEmoji?: string | null;
  onComposerBodyEmojiChange?: (emoji: string | null) => void;
  testID?: string;
};

/**
 * Half-bottom comment drawer: Modal backdrop dismiss + Android back + handle
 * drag-down dismiss (`StageAdvanceConfirmSheet` / `AccountSwitcherPanel` Modal
 * shell — no new drawer engine). Height sized for one audio row + composer;
 * thread scrolls.
 */
export function CommentDrawer({
  visible,
  onDismiss,
  comments,
  canCompose,
  canReact,
  isRecording,
  recordedAudioUri,
  playingCommentId,
  onRecordStart,
  onRecordStop,
  onSend,
  onReply,
  onReaction,
  onPlayPauseCommentAudio,
  replyToRootId = null,
  onClearAudio,
  composerText,
  onComposerTextChange,
  composerBodyEmoji,
  onComposerBodyEmojiChange,
  testID = 'comment-drawer',
}: CommentDrawerProps) {
  const insets = useSafeAreaInsets();
  const dragY = useRef(new Animated.Value(0)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gesture) =>
          gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_e, gesture) => {
          if (gesture.dy > 0) {
            dragY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_e, gesture) => {
          if (shouldDismissCommentDrawerDrag(gesture.dy, gesture.vy)) {
            dragY.setValue(0);
            onDismiss();
            return;
          }
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
      }),
    [dragY, onDismiss],
  );

  const sheetStyle = useMemo(
    () => ({
      paddingBottom: insets.bottom + theme.spacing.md,
      transform: [{ translateY: dragY }],
    }),
    [dragY, insets.bottom],
  );

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onDismiss}
          testID={`${testID}-backdrop`}
        >
          <Pressable
            onPress={event => event?.stopPropagation?.()}
            style={styles.sheetPressable}
            testID={testID}
          >
            <Animated.View style={[styles.sheet, sheetStyle]}>
              <View
                style={styles.handleHit}
                testID={`${testID}-handle`}
                {...panResponder.panHandlers}
              >
                <View style={styles.handle} />
              </View>
              <Text style={styles.title}>Comments</Text>
              {replyToRootId !== null ? (
                <Text style={styles.replyHint} testID={`${testID}-reply-hint`}>
                  Replying in thread
                </Text>
              ) : null}
              <ScrollView
                style={styles.threadScroll}
                contentContainerStyle={styles.threadContent}
                keyboardShouldPersistTaps="handled"
                testID={`${testID}-scroll`}
              >
                <CommentThreadList
                  comments={comments}
                  canCompose={canCompose}
                  canReact={canReact}
                  playingCommentId={playingCommentId}
                  onPlayPauseCommentAudio={onPlayPauseCommentAudio}
                  onReply={onReply}
                  onReaction={onReaction}
                  testID={`${testID}-threads`}
                />
              </ScrollView>
              <CommentComposer
                canCompose={canCompose}
                isRecording={isRecording}
                recordedAudioUri={recordedAudioUri}
                onRecordStart={onRecordStart}
                onRecordStop={onRecordStop}
                onSend={onSend}
                onClearAudio={onClearAudio}
                text={composerText}
                onTextChange={onComposerTextChange}
                bodyEmoji={composerBodyEmoji}
                onBodyEmojiChange={onComposerBodyEmojiChange}
                testID={`${testID}-composer`}
              />
            </Animated.View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Optional controlled shell for later route integration. Keeps reply target
 * local; does not wire Observer/Record routes.
 */
export type CommentDrawerEntryProps = Omit<
  CommentDrawerProps,
  'replyToRootId' | 'onReply'
> & {
  onReplyRootChange?: (rootCommentId: CommentReplyRootId | null) => void;
};

export function CommentDrawerEntry({
  onReplyRootChange,
  onDismiss,
  ...props
}: CommentDrawerEntryProps) {
  const [replyToRootId, setReplyToRootId] = useState<CommentReplyRootId | null>(
    null,
  );
  return (
    <CommentDrawer
      {...props}
      replyToRootId={replyToRootId}
      onDismiss={() => {
        setReplyToRootId(null);
        onReplyRootChange?.(null);
        onDismiss();
      }}
      onReply={rootId => {
        setReplyToRootId(rootId);
        onReplyRootChange?.(rootId);
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.drawerOverlay,
  },
  sheetPressable: {
    width: '100%',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    /** Fits one audio row + composer; threads scroll above. */
    maxHeight: '72%',
    minHeight: 220,
    gap: theme.spacing.sm,
  },
  handleHit: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  title: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  replyHint: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  threadScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 280,
  },
  threadContent: {
    paddingBottom: theme.spacing.sm,
  },
});
