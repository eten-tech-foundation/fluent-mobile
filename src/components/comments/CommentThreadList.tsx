import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../../theme';
import { CommentAudioRow } from './CommentAudioRow';
import {
  nextReactionEmoji,
  partitionCommentThreads,
  resolveReplyRootId,
  type OrderedComment,
} from './commentPresentation';
import type { CommentReactionRequest } from './types';

/** Presentation reaction picks (not a product allow-list). */
export const COMMENT_REACTION_EMOJI_PICKS = ['👍', '❤️', '🙏'] as const;

export type CommentThreadListProps = {
  comments: OrderedComment[];
  canCompose: boolean;
  canReact: boolean;
  playingCommentId: string | null;
  onPlayPauseCommentAudio: (commentId: string, audioUri: string) => void;
  onReply: (rootCommentId: string) => void;
  onReaction: (request: CommentReactionRequest) => void;
  testID?: string;
};

function CommentRow({
  comment,
  isReply,
  canCompose,
  canReact,
  playingCommentId,
  onPlayPauseCommentAudio,
  onReplyPress,
  onReaction,
  testID,
}: {
  comment: OrderedComment;
  isReply: boolean;
  canCompose: boolean;
  canReact: boolean;
  playingCommentId: string | null;
  onPlayPauseCommentAudio: (commentId: string, audioUri: string) => void;
  onReplyPress: () => void;
  onReaction: (request: CommentReactionRequest) => void;
  testID: string;
}) {
  return (
    <View
      style={[styles.commentRow, isReply && styles.replyRow]}
      testID={testID}
    >
      <View style={styles.metaRow}>
        <Text style={styles.author} testID={`${testID}-author`}>
          {comment.authorDisplayName}
        </Text>
        <Text style={styles.role} testID={`${testID}-role`}>
          {comment.authorRoleLabel}
        </Text>
        <Text style={styles.timestamp} testID={`${testID}-timestamp`}>
          {comment.createdAtLabel}
        </Text>
      </View>
      {comment.bodyEmoji !== null && comment.bodyEmoji.length > 0 ? (
        <Text style={styles.bodyEmoji} testID={`${testID}-body-emoji`}>
          {comment.bodyEmoji}
        </Text>
      ) : null}
      {comment.text !== null && comment.text.length > 0 ? (
        <Text style={styles.bodyText} testID={`${testID}-text`}>
          {comment.text}
        </Text>
      ) : null}
      {comment.audioUri !== null ? (
        <CommentAudioRow
          commentId={comment.id}
          audioUri={comment.audioUri}
          isPlaying={playingCommentId === comment.id}
          onPlayPause={onPlayPauseCommentAudio}
          testID={`${testID}-audio`}
        />
      ) : null}
      <View style={styles.actions}>
        {canCompose ? (
          <TouchableOpacity
            onPress={onReplyPress}
            accessibilityRole="button"
            accessibilityLabel="Reply"
            testID={`${testID}-reply`}
          >
            <Text style={styles.actionLabel}>Reply</Text>
          </TouchableOpacity>
        ) : null}
        {canReact
          ? COMMENT_REACTION_EMOJI_PICKS.map(emoji => {
              const selected = comment.currentUserReactionEmoji === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  onPress={() =>
                    onReaction({
                      commentId: comment.id,
                      emoji: nextReactionEmoji(
                        comment.currentUserReactionEmoji,
                        emoji,
                      ),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`React ${emoji}`}
                  accessibilityState={{ selected }}
                  testID={`${testID}-react-${emoji}`}
                  style={[
                    styles.reactionChip,
                    selected && styles.reactionChipSelected,
                  ]}
                >
                  <Text style={styles.reactionText}>{emoji}</Text>
                </TouchableOpacity>
              );
            })
          : null}
      </View>
    </View>
  );
}

/**
 * Connected oldest-first threads + labeled Unconnected section (all retained
 * Unconnected for the open chapter).
 */
export function CommentThreadList({
  comments,
  canCompose,
  canReact,
  playingCommentId,
  onPlayPauseCommentAudio,
  onReply,
  onReaction,
  testID = 'comment-thread-list',
}: CommentThreadListProps) {
  const { connectedRoots, unconnected } = useMemo(
    () => partitionCommentThreads(comments),
    [comments],
  );

  return (
    <View style={styles.root} testID={testID}>
      <View testID={`${testID}-connected`}>
        {connectedRoots.map(({ root, replies }) => (
          <View key={root.id} testID={`${testID}-thread-${root.id}`}>
            <CommentRow
              comment={root}
              isReply={false}
              canCompose={canCompose}
              canReact={canReact}
              playingCommentId={playingCommentId}
              onPlayPauseCommentAudio={onPlayPauseCommentAudio}
              onReplyPress={() =>
                onReply(resolveReplyRootId(root.id, comments))
              }
              onReaction={onReaction}
              testID={`${testID}-comment-${root.id}`}
            />
            {replies.map(reply => (
              <CommentRow
                key={reply.id}
                comment={reply}
                isReply
                canCompose={canCompose}
                canReact={canReact}
                playingCommentId={playingCommentId}
                onPlayPauseCommentAudio={onPlayPauseCommentAudio}
                onReplyPress={() =>
                  onReply(resolveReplyRootId(reply.id, comments))
                }
                onReaction={onReaction}
                testID={`${testID}-comment-${reply.id}`}
              />
            ))}
          </View>
        ))}
      </View>
      {unconnected.length > 0 ? (
        <View
          style={styles.unconnectedSection}
          testID={`${testID}-unconnected`}
        >
          <Text style={styles.unconnectedHeading}>Unconnected</Text>
          {unconnected.map(comment => (
            <CommentRow
              key={comment.id}
              comment={comment}
              isReply={false}
              canCompose={canCompose}
              canReact={canReact}
              playingCommentId={playingCommentId}
              onPlayPauseCommentAudio={onPlayPauseCommentAudio}
              onReplyPress={() =>
                onReply(resolveReplyRootId(comment.id, comments))
              }
              onReaction={onReaction}
              testID={`${testID}-comment-${comment.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.md,
  },
  commentRow: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  replyRow: {
    marginLeft: theme.spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  author: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.foreground,
  },
  role: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  timestamp: {
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.mutedForeground,
  },
  bodyText: {
    fontSize: theme.typography.sizes.md,
    color: theme.colors.foreground,
  },
  bodyEmoji: {
    fontSize: theme.typography.sizes.xl,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  actionLabel: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.medium,
  },
  reactionChip: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  reactionChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.cardBackground,
  },
  reactionText: {
    fontSize: theme.typography.sizes.sm,
  },
  unconnectedSection: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  unconnectedHeading: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
  },
});
