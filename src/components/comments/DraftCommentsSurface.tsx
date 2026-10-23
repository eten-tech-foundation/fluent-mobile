import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { MessageSquare } from 'lucide-react-native';
import type { UseDraftCommentsSurfaceApi } from '../../hooks/useDraftCommentsSurface';
import { iconSizes, listIconStrokeWidth, theme } from '../../theme';
import { CommentDrawerEntry } from './CommentDrawer';
import { CommentIndicator } from './CommentIndicator';

export type DraftCommentsDrawerHostProps = {
  surface: UseDraftCommentsSurfaceApi;
  testID?: string;
};

/** Renders the #451 CommentDrawer bound to a draft-comments surface controller. */
export function DraftCommentsDrawerHost({
  surface,
  testID = 'draft-comments-drawer',
}: DraftCommentsDrawerHostProps) {
  return (
    <CommentDrawerEntry
      visible={surface.drawerVisible}
      onDismiss={surface.dismiss}
      comments={surface.comments}
      canCompose={surface.canCompose}
      canReact={surface.canReact}
      isRecording={surface.isRecording}
      recordedAudioUri={surface.recordedAudioUri}
      playingCommentId={surface.playingCommentId}
      onRecordStart={surface.onRecordStart}
      onRecordStop={surface.onRecordStop}
      onSend={surface.onSend}
      onClearAudio={surface.onClearRecordedAudio}
      composerText={surface.composerText}
      onComposerTextChange={surface.onComposerTextChange}
      composerBodyEmoji={surface.composerBodyEmoji}
      onComposerBodyEmojiChange={surface.onComposerBodyEmojiChange}
      onReaction={surface.onReaction}
      onPlayPauseCommentAudio={surface.onPlayPauseCommentAudio}
      onReplyRootChange={surface.onReplyRootChange}
      testID={testID}
    />
  );
}

export type DraftCommentsEntryButtonProps = {
  surface: UseDraftCommentsSurfaceApi;
  testID?: string;
};

/**
 * Always-available chapter comments entry (Record first-comment path).
 * Indicator count is fail-closed from the #792 aggregate cache.
 */
export function DraftCommentsEntryButton({
  surface,
  testID = 'draft-comments-entry',
}: DraftCommentsEntryButtonProps) {
  return (
    <TouchableOpacity
      onPress={surface.openChapter}
      accessibilityRole="button"
      accessibilityLabel="Open comments"
      testID={testID}
      style={styles.entryButton}
    >
      <MessageSquare
        size={iconSizes.headerTab}
        color={theme.colors.mutedForeground}
        strokeWidth={listIconStrokeWidth}
        testID={`${testID}-icon`}
      />
      <CommentIndicator
        count={surface.chapterCommentCount}
        testID={`${testID}-indicator`}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  entryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
});
