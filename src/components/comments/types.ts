/**
 * Presentation view-models for #451 draft comments.
 * Wire routes/types pin fluent-api PR #459 tip
 * `dfad78d7438caad4391ad77d2e442e7c921f88e1` (see
 * `src/types/api/chapterComments.ts`). Aggregate reads also use PR #792
 * cache helpers. Screen mounts keep `canCompose` / `canReact` false until
 * deploy + product enablement — mutation paths stay gated in the surface.
 */

export type CommentConnectionState = 'connected' | 'unconnected';

export type CommentBodyKind = 'text' | 'audio' | 'emoji_only';

/** Stable id of a top-level (root) comment. Replies always target this. */
export type CommentReplyRootId = string;

/** One comment row for pure presentation (ids + display fields only). */
export type CommentPresentationItem = {
  id: string;
  /**
   * Null = top-level root. Non-null replies always flatten to
   * {@link CommentReplyRootId} via `resolveReplyRootId`.
   */
  parentId: CommentReplyRootId | null;
  authorDisplayName: string;
  authorRoleLabel: string;
  /** Preformatted timestamp label for display. */
  createdAtLabel: string;
  text: string | null;
  /** Body emoji for emoji-only comments (not a reaction). */
  bodyEmoji: string | null;
  audioUri: string | null;
  connectionState: CommentConnectionState;
  /** Current user's one active reaction emoji, if any. */
  currentUserReactionEmoji: string | null;
};

export type CommentComposerDraft = {
  text: string;
  bodyEmoji: string | null;
  audioUri: string | null;
};

/** API459 wire modalities are mutually exclusive (text XOR emoji XOR audio). */
export type CommentSendPayload =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; audioUri: string }
  | { kind: 'emoji_only'; emoji: string };

export type CommentReactionRequest = {
  commentId: string;
  /** Null clears the current user's reaction. */
  emoji: string | null;
};

/**
 * Controlled playback mirror for comment clips. Parent / adapter owns a
 * hook-scoped `usePlaybackEngine` player instance — presentation only
 * forwards ids (do not mount a second adapter beside another player without
 * sharing).
 */
export type CommentAudioPlaybackState = {
  playingCommentId: string | null;
};

/** Controlled recording mirror for the composer mic control. */
export type CommentRecordingState = {
  isRecording: boolean;
  recordedAudioUri: string | null;
};
