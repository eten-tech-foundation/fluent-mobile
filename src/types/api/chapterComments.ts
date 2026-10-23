/**
 * Draft chapter comments wire (fluent-api PR #459).
 * Pinned published heads: d2637641478eda0ffde8b47cbb1cf949afbee0df (post-upload
 * lock serialize) and tip dfad78d7438caad4391ad77d2e442e7c921f88e1.
 *
 * Routes (no speculative paths):
 * - GET    /chapter-assignments/{id}/comments
 * - POST   /chapter-assignments/{id}/comments
 * - POST   /chapter-assignments/{id}/comments/audio
 * - POST   /chapter-assignments/{id}/comments/replies
 * - PUT    /chapter-assignments/{id}/comments/{commentId}/reaction
 * - DELETE /chapter-assignments/{id}/comments/{commentId}/reaction
 */

export type ChapterCommentBodyKind = 'text' | 'audio' | 'emoji';

export type ChapterCommentConnectionState = 'connected' | 'unconnected';

export type ChapterCommentAnchorKind = 'verse' | 'pericope';

export type ChapterCommentAnchorInput =
  | { kind: 'verse'; bibleTextId: number }
  | {
      kind: 'pericope';
      pericopeNumber: string;
      pericopeSetId?: number;
    };

export type ChapterCommentJsonBody =
  | { kind: 'text'; text: string }
  | { kind: 'emoji'; emoji: string };

export type CreateTopLevelChapterCommentRequest = {
  anchor: ChapterCommentAnchorInput;
  body: ChapterCommentJsonBody;
};

export type CreateChapterCommentReplyRequest = {
  replyToCommentId: number;
  body: ChapterCommentJsonBody;
};

export type ChapterCommentAuthor = {
  userId: number;
  displayName: string;
  roleDisplay: string | null;
};

export type ChapterCommentAnchorSnapshot = {
  kind: ChapterCommentAnchorKind;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  bibleTextId: number | null;
  verseNumber: number | null;
  pericopeSetId: number | null;
  pericopeNumber: string | null;
  pericopeTitle: string | null;
};

export type ChapterCommentAudioRef = {
  contentType: string;
  byteSize: number;
  durationSeconds: number | null;
  contentHash: string;
  downloadUrl: string | null;
};

export type ChapterCommentReactionSummary = {
  emoji: string;
  count: number;
};

export type ChapterComment = {
  id: number;
  projectId: number;
  chapterAssignmentId: number;
  parentCommentId: number | null;
  author: ChapterCommentAuthor;
  createdAt: string;
  bodyKind: ChapterCommentBodyKind;
  text: string | null;
  emoji: string | null;
  audio: ChapterCommentAudioRef | null;
  anchor: ChapterCommentAnchorSnapshot;
  connectionState: ChapterCommentConnectionState;
  reactions: ChapterCommentReactionSummary[];
  currentUserReaction: string | null;
};

export type ListChapterCommentsResponse = {
  connected: ChapterComment[];
  unconnected: ChapterComment[];
};

export type SetChapterCommentReactionResponse = {
  emoji: string | null;
};

export type ClearChapterCommentReactionResponse = {
  cleared: true;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseAuthor(value: unknown): ChapterCommentAuthor | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!isPositiveInt(raw.userId) || typeof raw.displayName !== 'string') {
    return null;
  }
  if (raw.roleDisplay !== null && typeof raw.roleDisplay !== 'string') {
    return null;
  }
  return {
    userId: raw.userId,
    displayName: raw.displayName,
    roleDisplay: raw.roleDisplay,
  };
}

function parseAnchor(value: unknown): ChapterCommentAnchorSnapshot | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'verse' && raw.kind !== 'pericope') {
    return null;
  }
  if (
    !isPositiveInt(raw.bibleId) ||
    !isPositiveInt(raw.bookId) ||
    !isPositiveInt(raw.chapterNumber)
  ) {
    return null;
  }
  if (raw.bibleTextId !== null && !isPositiveInt(raw.bibleTextId)) {
    return null;
  }
  if (raw.verseNumber !== null && !isPositiveInt(raw.verseNumber)) {
    return null;
  }
  if (raw.pericopeSetId !== null && !isPositiveInt(raw.pericopeSetId)) {
    return null;
  }
  if (raw.pericopeNumber !== null && typeof raw.pericopeNumber !== 'string') {
    return null;
  }
  if (raw.pericopeTitle !== null && typeof raw.pericopeTitle !== 'string') {
    return null;
  }
  return {
    kind: raw.kind,
    bibleId: raw.bibleId,
    bookId: raw.bookId,
    chapterNumber: raw.chapterNumber,
    bibleTextId: raw.bibleTextId,
    verseNumber: raw.verseNumber,
    pericopeSetId: raw.pericopeSetId,
    pericopeNumber: raw.pericopeNumber,
    pericopeTitle: raw.pericopeTitle,
  };
}

function parseAudio(value: unknown): ChapterCommentAudioRef | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.contentType !== 'string' ||
    !isNonNegativeInt(raw.byteSize) ||
    typeof raw.contentHash !== 'string'
  ) {
    return null;
  }
  if (
    raw.durationSeconds !== null &&
    !isNonNegativeNumber(raw.durationSeconds)
  ) {
    return null;
  }
  if (raw.downloadUrl !== null && typeof raw.downloadUrl !== 'string') {
    return null;
  }
  return {
    contentType: raw.contentType,
    byteSize: raw.byteSize,
    durationSeconds: raw.durationSeconds,
    contentHash: raw.contentHash,
    downloadUrl: raw.downloadUrl,
  };
}

function parseReactions(
  value: unknown,
): ChapterCommentReactionSummary[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const out: ChapterCommentReactionSummary[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const raw = item as Record<string, unknown>;
    if (typeof raw.emoji !== 'string' || !isNonNegativeInt(raw.count)) {
      return null;
    }
    out.push({ emoji: raw.emoji, count: raw.count });
  }
  return out;
}

/**
 * Structural parse against the pinned chapterCommentResponseSchema. Never
 * coerces. When `expectedChapterAssignmentId` is set, payload id must match.
 */
export function parseChapterComment(
  value: unknown,
  expectedChapterAssignmentId?: number,
): ChapterComment | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (
    !isPositiveInt(raw.id) ||
    !isPositiveInt(raw.projectId) ||
    !isPositiveInt(raw.chapterAssignmentId)
  ) {
    return null;
  }
  if (
    expectedChapterAssignmentId !== undefined &&
    raw.chapterAssignmentId !== expectedChapterAssignmentId
  ) {
    return null;
  }
  if (raw.parentCommentId !== null && !isPositiveInt(raw.parentCommentId)) {
    return null;
  }
  const author = parseAuthor(raw.author);
  if (!author) {
    return null;
  }
  if (typeof raw.createdAt !== 'string') {
    return null;
  }
  if (
    raw.bodyKind !== 'text' &&
    raw.bodyKind !== 'audio' &&
    raw.bodyKind !== 'emoji'
  ) {
    return null;
  }
  if (raw.text !== null && typeof raw.text !== 'string') {
    return null;
  }
  if (raw.emoji !== null && typeof raw.emoji !== 'string') {
    return null;
  }
  const audio = parseAudio(raw.audio);
  if (raw.audio !== null && audio === null) {
    return null;
  }
  const anchor = parseAnchor(raw.anchor);
  if (!anchor) {
    return null;
  }
  if (
    raw.connectionState !== 'connected' &&
    raw.connectionState !== 'unconnected'
  ) {
    return null;
  }
  const reactions = parseReactions(raw.reactions);
  if (!reactions) {
    return null;
  }
  if (
    raw.currentUserReaction !== null &&
    typeof raw.currentUserReaction !== 'string'
  ) {
    return null;
  }
  return {
    id: raw.id,
    projectId: raw.projectId,
    chapterAssignmentId: raw.chapterAssignmentId,
    parentCommentId: raw.parentCommentId,
    author,
    createdAt: raw.createdAt,
    bodyKind: raw.bodyKind,
    text: raw.text,
    emoji: raw.emoji,
    audio,
    anchor,
    connectionState: raw.connectionState,
    reactions,
    currentUserReaction: raw.currentUserReaction,
  };
}

export function parseListChapterCommentsResponse(
  value: unknown,
  expectedChapterAssignmentId?: number,
): ListChapterCommentsResponse | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.connected) || !Array.isArray(raw.unconnected)) {
    return null;
  }
  const connected: ChapterComment[] = [];
  for (const item of raw.connected) {
    const parsed = parseChapterComment(item, expectedChapterAssignmentId);
    if (!parsed) {
      return null;
    }
    connected.push(parsed);
  }
  const unconnected: ChapterComment[] = [];
  for (const item of raw.unconnected) {
    const parsed = parseChapterComment(item, expectedChapterAssignmentId);
    if (!parsed) {
      return null;
    }
    unconnected.push(parsed);
  }
  return { connected, unconnected };
}

export function parseSetChapterCommentReactionResponse(
  value: unknown,
): SetChapterCommentReactionResponse | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.emoji !== null && typeof raw.emoji !== 'string') {
    return null;
  }
  return { emoji: raw.emoji };
}

export function parseClearChapterCommentReactionResponse(
  value: unknown,
): ClearChapterCommentReactionResponse | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.cleared !== true) {
    return null;
  }
  return { cleared: true };
}
