/**
 * #451 draft-comments surface controller for Observer Draft / Record.
 * Binds fluent-api PR #459 tip dfad78d list/create/reply/audio/reaction +
 * PR #792 aggregate refresh helpers. Mutations stay behind `canCompose` /
 * `canReact` (screens keep both false until deploy + product enablement).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrderedComment } from '../components/comments/commentPresentation';
import type {
  CommentReactionRequest,
  CommentReplyRootId,
  CommentSendPayload,
} from '../components/comments/types';
import { FluentAPI } from '../services/api';
import {
  readBoundCommentAggregate,
  refreshBoundCommentAggregates,
} from '../services/commentAggregateBinding';
import {
  countCommentsByBibleTextId,
  countCommentsByPericopeNumber,
  filterCommentsForDrawer,
  flattenChapterCommentList,
  mapChapterCommentToOrdered,
} from '../services/chapterCommentPresentation';
import {
  type DraftCommentAnchor,
  toChapterCommentAnchorInput,
} from '../services/draftCommentAnchor';
import { getCredentials } from '../services/keychain';
import type { ChapterComment } from '../types/api/chapterComments';
import { logger } from '../utils/logger';
import { useCommentPlaybackAdapter } from './useCommentPlaybackAdapter';
import { useCommentRecordingAdapter } from './useCommentRecordingAdapter';

const log = logger.create('DraftCommentsSurface');

export type { DraftCommentAnchor };

/** @deprecated Prefer {@link DraftCommentAnchor}. */
export type DraftCommentsVerseAnchor = {
  kind: 'verse';
  bibleTextId: number;
};

export type UseDraftCommentsSurfaceOptions = {
  chapterAssignmentId: number | null;
  userId: string;
  /** Draft/Record tab active + access granted. */
  enabled: boolean;
  canCompose: boolean;
  canReact: boolean;
  /**
   * Active draft-unit anchor (verse or pericope). Used when the drawer opens
   * chapter-wide and as create fallback when no filter anchor is set.
   */
  activeCommentAnchor?: DraftCommentAnchor | null;
  /**
   * @deprecated Prefer `activeCommentAnchor`. Verse-only convenience for
   * callers that have not migrated.
   */
  activeVerseBibleTextId?: number | null;
};

export type UseDraftCommentsSurfaceApi = {
  drawerVisible: boolean;
  comments: OrderedComment[];
  loading: boolean;
  canCompose: boolean;
  canReact: boolean;
  isRecording: boolean;
  recordedAudioUri: string | null;
  playingCommentId: string | null;
  chapterCommentCount: number | null;
  commentCountByBibleTextId: ReadonlyMap<number, number>;
  commentCountByPericopeNumber: ReadonlyMap<string, number>;
  /** Surface-owned composer text (preserved across dismiss). */
  composerText: string;
  composerBodyEmoji: string | null;
  openForAnchor: (anchor: DraftCommentAnchor) => void;
  openForVerse: (bibleTextId: number) => void;
  openForPericope: (
    pericopeNumber: string,
    pericopeSetId?: number | null,
  ) => void;
  openChapter: () => void;
  dismiss: () => void;
  onRecordStart: () => void;
  onRecordStop: () => void;
  onClearRecordedAudio: () => void;
  onComposerTextChange: (text: string) => void;
  onComposerBodyEmojiChange: (emoji: string | null) => void;
  /** `true` clears draft; `false` preserves draft (gate / failure). */
  onSend: (payload: CommentSendPayload) => Promise<boolean>;
  onReaction: (request: CommentReactionRequest) => void;
  onPlayPauseCommentAudio: (commentId: string, audioUri: string) => void;
  onReplyRootChange: (rootCommentId: CommentReplyRootId | null) => void;
  refresh: () => void;
};

function parseCommentId(id: string): number | null {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }
  return n;
}

function resolveActiveAnchor(
  activeCommentAnchor: DraftCommentAnchor | null | undefined,
  activeVerseBibleTextId: number | null | undefined,
): DraftCommentAnchor | null {
  if (activeCommentAnchor !== null && activeCommentAnchor !== undefined) {
    return activeCommentAnchor;
  }
  if (
    typeof activeVerseBibleTextId === 'number' &&
    Number.isInteger(activeVerseBibleTextId) &&
    activeVerseBibleTextId > 0
  ) {
    return { kind: 'verse', bibleTextId: activeVerseBibleTextId };
  }
  return null;
}

export function useDraftCommentsSurface(
  options: UseDraftCommentsSurfaceOptions,
): UseDraftCommentsSurfaceApi {
  const {
    chapterAssignmentId,
    userId,
    enabled,
    canCompose,
    canReact,
    activeCommentAnchor = null,
    activeVerseBibleTextId = null,
  } = options;

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<DraftCommentAnchor | null>(
    null,
  );
  const [rawComments, setRawComments] = useState<ChapterComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyRootId, setReplyRootId] = useState<CommentReplyRootId | null>(
    null,
  );
  const [aggregateTick, setAggregateTick] = useState(0);
  const [composerText, setComposerText] = useState('');
  const [composerBodyEmoji, setComposerBodyEmoji] = useState<string | null>(
    null,
  );

  const recording = useCommentRecordingAdapter();
  const playback = useCommentPlaybackAdapter();
  const stopCommentAudio = playback.stopCommentAudio;
  const clearRecordedAudio = recording.clearRecordedAudio;
  const loadGenRef = useRef(0);

  const resolvedActiveAnchor = resolveActiveAnchor(
    activeCommentAnchor,
    activeVerseBibleTextId,
  );
  const createAnchor = filterAnchor ?? resolvedActiveAnchor;

  const chapterCommentCount = useMemo(() => {
    void aggregateTick;
    if (!userId || chapterAssignmentId === null) {
      return null;
    }
    const entry = readBoundCommentAggregate(userId, chapterAssignmentId);
    if (entry.status !== 'known') {
      return null;
    }
    return entry.commentCount;
  }, [aggregateTick, chapterAssignmentId, userId]);

  const commentCountByBibleTextId = useMemo(
    () => countCommentsByBibleTextId(rawComments),
    [rawComments],
  );

  const commentCountByPericopeNumber = useMemo(
    () => countCommentsByPericopeNumber(rawComments),
    [rawComments],
  );

  const comments = useMemo(() => {
    const filtered = filterCommentsForDrawer(rawComments, filterAnchor);
    return filtered.map(mapChapterCommentToOrdered);
  }, [filterAnchor, rawComments]);

  const refreshAggregates = useCallback(async () => {
    if (!userId || chapterAssignmentId === null) {
      return;
    }
    const creds = await getCredentials(userId);
    if (!creds?.token) {
      return;
    }
    await refreshBoundCommentAggregates({
      userId,
      sessionToken: creds.token,
      chapterAssignmentIds: [chapterAssignmentId],
    });
    setAggregateTick(tick => tick + 1);
  }, [chapterAssignmentId, userId]);

  const loadComments = useCallback(async () => {
    if (!enabled || chapterAssignmentId === null) {
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    try {
      const list = await FluentAPI.listChapterComments(chapterAssignmentId);
      if (gen !== loadGenRef.current) {
        return;
      }
      setRawComments(flattenChapterCommentList(list));
    } catch (error) {
      if (gen !== loadGenRef.current) {
        return;
      }
      log.warn('Chapter comments list failed', { error });
      setRawComments([]);
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
      }
    }
  }, [chapterAssignmentId, enabled]);

  useEffect(() => {
    if (!enabled || chapterAssignmentId === null) {
      setDrawerVisible(false);
      setRawComments([]);
      setFilterAnchor(null);
      setReplyRootId(null);
      stopCommentAudio();
      return;
    }
    void loadComments();
    void refreshAggregates();
  }, [
    chapterAssignmentId,
    enabled,
    loadComments,
    refreshAggregates,
    stopCommentAudio,
  ]);

  const openForAnchor = useCallback(
    (anchor: DraftCommentAnchor) => {
      if (!enabled || chapterAssignmentId === null) {
        return;
      }
      setFilterAnchor(anchor);
      setReplyRootId(null);
      setDrawerVisible(true);
      void loadComments();
    },
    [chapterAssignmentId, enabled, loadComments],
  );

  const openForVerse = useCallback(
    (bibleTextId: number) => {
      openForAnchor({ kind: 'verse', bibleTextId });
    },
    [openForAnchor],
  );

  const openForPericope = useCallback(
    (pericopeNumber: string, pericopeSetId?: number | null) => {
      openForAnchor({
        kind: 'pericope',
        pericopeNumber,
        pericopeSetId: pericopeSetId ?? null,
      });
    },
    [openForAnchor],
  );

  const openChapter = useCallback(() => {
    if (!enabled || chapterAssignmentId === null) {
      return;
    }
    setFilterAnchor(resolvedActiveAnchor);
    setReplyRootId(null);
    setDrawerVisible(true);
    void loadComments();
  }, [chapterAssignmentId, enabled, loadComments, resolvedActiveAnchor]);

  const dismiss = useCallback(() => {
    // Preserve composer text/emoji + recorded clip across dismiss; clear
    // reply target and stop playback only.
    setDrawerVisible(false);
    setReplyRootId(null);
    stopCommentAudio();
  }, [stopCommentAudio]);

  const onRecordStart = useCallback(() => {
    setComposerText('');
    setComposerBodyEmoji(null);
    recording.onRecordStart();
  }, [recording]);

  const onSend = useCallback(
    async (payload: CommentSendPayload): Promise<boolean> => {
      if (!enabled || chapterAssignmentId === null || !canCompose) {
        return false;
      }
      try {
        const replyId =
          replyRootId === null ? null : parseCommentId(replyRootId);

        if (payload.kind === 'audio') {
          if (replyId !== null) {
            await FluentAPI.createCommentAudio(chapterAssignmentId, {
              file: {
                uri: payload.audioUri,
                name: 'comment.aac',
                type: 'audio/aac',
              },
              replyToCommentId: replyId,
            });
          } else if (createAnchor !== null) {
            if (createAnchor.kind === 'verse') {
              await FluentAPI.createCommentAudio(chapterAssignmentId, {
                file: {
                  uri: payload.audioUri,
                  name: 'comment.aac',
                  type: 'audio/aac',
                },
                anchorKind: 'verse',
                bibleTextId: createAnchor.bibleTextId,
              });
            } else {
              await FluentAPI.createCommentAudio(chapterAssignmentId, {
                file: {
                  uri: payload.audioUri,
                  name: 'comment.aac',
                  type: 'audio/aac',
                },
                anchorKind: 'pericope',
                pericopeNumber: createAnchor.pericopeNumber,
                ...(typeof createAnchor.pericopeSetId === 'number' &&
                createAnchor.pericopeSetId > 0
                  ? { pericopeSetId: createAnchor.pericopeSetId }
                  : {}),
              });
            }
          } else {
            log.warn('Comment audio send skipped; no draft anchor');
            return false;
          }
        } else if (payload.kind === 'text') {
          const body = { kind: 'text' as const, text: payload.text };
          if (replyId !== null) {
            await FluentAPI.createChapterCommentReply(chapterAssignmentId, {
              replyToCommentId: replyId,
              body,
            });
          } else if (createAnchor !== null) {
            await FluentAPI.createChapterComment(chapterAssignmentId, {
              anchor: toChapterCommentAnchorInput(createAnchor),
              body,
            });
          } else {
            log.warn('Comment text send skipped; no draft anchor');
            return false;
          }
        } else {
          // Presentation `emoji_only` → wire `{ kind: 'emoji', emoji }`.
          const body = { kind: 'emoji' as const, emoji: payload.emoji };
          if (replyId !== null) {
            await FluentAPI.createChapterCommentReply(chapterAssignmentId, {
              replyToCommentId: replyId,
              body,
            });
          } else if (createAnchor !== null) {
            await FluentAPI.createChapterComment(chapterAssignmentId, {
              anchor: toChapterCommentAnchorInput(createAnchor),
              body,
            });
          } else {
            log.warn('Comment emoji send skipped; no draft anchor');
            return false;
          }
        }

        clearRecordedAudio();
        setComposerText('');
        setComposerBodyEmoji(null);
        setReplyRootId(null);
        await loadComments();
        await refreshAggregates();
        return true;
      } catch (error) {
        log.error('Comment send failed', { error });
        return false;
      }
    },
    [
      canCompose,
      chapterAssignmentId,
      clearRecordedAudio,
      createAnchor,
      enabled,
      loadComments,
      refreshAggregates,
      replyRootId,
    ],
  );

  const onReaction = useCallback(
    (request: CommentReactionRequest) => {
      if (!enabled || chapterAssignmentId === null || !canReact) {
        return;
      }
      const commentId = parseCommentId(request.commentId);
      if (commentId === null) {
        return;
      }
      void (async () => {
        try {
          // Thread list already applies nextReactionEmoji (null = clear).
          if (request.emoji === null) {
            await FluentAPI.clearChapterCommentReaction(
              chapterAssignmentId,
              commentId,
            );
          } else {
            await FluentAPI.setChapterCommentReaction(
              chapterAssignmentId,
              commentId,
              request.emoji,
            );
          }
          await loadComments();
          // Reactions do not change aggregates (#703 / decision 2).
        } catch (error) {
          log.error('Comment reaction failed', { error });
        }
      })();
    },
    [canReact, chapterAssignmentId, enabled, loadComments],
  );

  return {
    drawerVisible,
    comments,
    loading,
    canCompose,
    canReact,
    isRecording: recording.isRecording,
    recordedAudioUri: recording.recordedAudioUri,
    playingCommentId: playback.playingCommentId,
    chapterCommentCount,
    commentCountByBibleTextId,
    commentCountByPericopeNumber,
    composerText,
    composerBodyEmoji,
    openForAnchor,
    openForVerse,
    openForPericope,
    openChapter,
    dismiss,
    onRecordStart,
    onRecordStop: recording.onRecordStop,
    onClearRecordedAudio: clearRecordedAudio,
    onComposerTextChange: setComposerText,
    onComposerBodyEmojiChange: setComposerBodyEmoji,
    onSend,
    onReaction,
    onPlayPauseCommentAudio: playback.onPlayPauseCommentAudio,
    onReplyRootChange: setReplyRootId,
    refresh: () => {
      void loadComments();
      void refreshAggregates();
    },
  };
}
