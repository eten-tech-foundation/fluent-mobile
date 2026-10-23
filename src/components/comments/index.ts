export { CommentIndicator } from './CommentIndicator';
export type { CommentIndicatorProps } from './CommentIndicator';
export { CommentAudioRow } from './CommentAudioRow';
export type { CommentAudioRowProps } from './CommentAudioRow';
export { CommentComposer, COMMENT_BODY_EMOJI_PICKS } from './CommentComposer';
export type { CommentComposerProps } from './CommentComposer';
export {
  CommentThreadList,
  COMMENT_REACTION_EMOJI_PICKS,
} from './CommentThreadList';
export type { CommentThreadListProps } from './CommentThreadList';
export { CommentDrawer, CommentDrawerEntry } from './CommentDrawer';
export type {
  CommentDrawerProps,
  CommentDrawerEntryProps,
} from './CommentDrawer';
export {
  DraftCommentsDrawerHost,
  DraftCommentsEntryButton,
} from './DraftCommentsSurface';
export type {
  DraftCommentsDrawerHostProps,
  DraftCommentsEntryButtonProps,
} from './DraftCommentsSurface';
export {
  buildComposerSendPayload,
  isComposerDraftEmpty,
  nextReactionEmoji,
  partitionCommentThreads,
  resolveReplyRootId,
  sortOldestFirst,
} from './commentPresentation';
export type { OrderedComment } from './commentPresentation';
export {
  COMMENT_DRAWER_DISMISS_DY,
  COMMENT_DRAWER_DISMISS_VY,
  shouldDismissCommentDrawerDrag,
} from './commentDrawerDismiss';

export type {
  CommentAudioPlaybackState,
  CommentBodyKind,
  CommentComposerDraft,
  CommentConnectionState,
  CommentPresentationItem,
  CommentReactionRequest,
  CommentRecordingState,
  CommentReplyRootId,
  CommentSendPayload,
} from './types';
