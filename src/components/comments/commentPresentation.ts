import type {
  CommentComposerDraft,
  CommentPresentationItem,
  CommentSendPayload,
} from './types';

/** Oldest → newest by createdAtLabel is not reliable; sort by explicit order index or id insertion. Use provided `order` when present. */
export type OrderedComment = CommentPresentationItem & {
  /** Ascending sort key (epoch ms or sequence). Required for stable oldest-first. */
  sortKey: number;
};

export function sortOldestFirst<T extends { sortKey: number }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => a.sortKey - b.sortKey);
}

/**
 * Partition into connected roots (with first-level replies) and Unconnected
 * (all retained Unconnected for the open chapter — approved).
 */
export function partitionCommentThreads(items: OrderedComment[]): {
  connectedRoots: Array<{
    root: OrderedComment;
    replies: OrderedComment[];
  }>;
  unconnected: OrderedComment[];
} {
  const ordered = sortOldestFirst(items);
  const unconnected = ordered.filter(c => c.connectionState === 'unconnected');
  const connected = ordered.filter(c => c.connectionState === 'connected');
  const roots = connected.filter(c => c.parentId === null);
  const byParent = new Map<string, OrderedComment[]>();
  for (const c of connected) {
    if (c.parentId === null) continue;
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  const connectedRoots = roots.map(root => ({
    root,
    replies: sortOldestFirst(byParent.get(root.id) ?? []),
  }));
  return { connectedRoots, unconnected };
}

/**
 * Further reply attempts always target the root id (#451 one-level flatten).
 */
export function resolveReplyRootId(
  targetCommentId: string,
  items: ReadonlyArray<Pick<CommentPresentationItem, 'id' | 'parentId'>>,
): string {
  const byId = new Map(items.map(c => [c.id, c]));
  let current = byId.get(targetCommentId);
  if (!current) return targetCommentId;
  while (current.parentId !== null) {
    const parent = byId.get(current.parentId);
    if (!parent) return current.parentId;
    current = parent;
  }
  return current.id;
}

/** Empty when no text, no audio clip URI, and no body emoji. */
export function isComposerDraftEmpty(draft: CommentComposerDraft): boolean {
  return (
    draft.text.trim().length === 0 &&
    draft.audioUri === null &&
    (draft.bodyEmoji === null || draft.bodyEmoji.length === 0)
  );
}

/**
 * Build send payload from draft for API459 modalities.
 * Exactly one of audio / text / emoji — audio wins if a clip URI is present
 * (composer UI clears conflicting fields before send).
 */
export function buildComposerSendPayload(
  draft: CommentComposerDraft,
): CommentSendPayload | null {
  if (isComposerDraftEmpty(draft)) return null;
  const text = draft.text.trim();
  if (draft.audioUri !== null) {
    return { kind: 'audio', audioUri: draft.audioUri };
  }
  if (text.length > 0) {
    return { kind: 'text', text };
  }
  if (draft.bodyEmoji !== null && draft.bodyEmoji.length > 0) {
    return { kind: 'emoji_only', emoji: draft.bodyEmoji };
  }
  return null;
}

/** Next reaction after tap: same emoji clears; different replaces. */
export function nextReactionEmoji(
  current: string | null,
  tapped: string,
): string | null {
  return current === tapped ? null : tapped;
}
