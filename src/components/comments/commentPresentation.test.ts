import {
  buildComposerSendPayload,
  isComposerDraftEmpty,
  nextReactionEmoji,
  partitionCommentThreads,
  resolveReplyRootId,
  sortOldestFirst,
  type OrderedComment,
} from './commentPresentation';

function item(
  partial: Partial<OrderedComment> &
    Pick<OrderedComment, 'id' | 'sortKey' | 'connectionState'>,
): OrderedComment {
  return {
    parentId: null,
    authorDisplayName: 'Ada',
    authorRoleLabel: 'Observer',
    createdAtLabel: '1m',
    text: null,
    bodyEmoji: null,
    audioUri: null,
    currentUserReactionEmoji: null,
    ...partial,
  };
}

describe('commentPresentation', () => {
  it('sorts oldest first by sortKey', () => {
    const sorted = sortOldestFirst([
      item({ id: 'b', sortKey: 20, connectionState: 'connected' }),
      item({ id: 'a', sortKey: 10, connectionState: 'connected' }),
    ]);
    expect(sorted.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('partitions connected threads and all chapter Unconnected', () => {
    const { connectedRoots, unconnected } = partitionCommentThreads([
      item({
        id: 'u1',
        sortKey: 5,
        connectionState: 'unconnected',
        text: 'orphan',
      }),
      item({
        id: 'r1',
        sortKey: 1,
        connectionState: 'connected',
        text: 'root',
      }),
      item({
        id: 'c1',
        sortKey: 2,
        parentId: 'r1',
        connectionState: 'connected',
        text: 'reply',
      }),
      item({
        id: 'u2',
        sortKey: 3,
        connectionState: 'unconnected',
        text: 'other',
      }),
    ]);
    expect(connectedRoots).toHaveLength(1);
    expect(connectedRoots[0]?.root.id).toBe('r1');
    expect(connectedRoots[0]?.replies.map(r => r.id)).toEqual(['c1']);
    expect(unconnected.map(c => c.id)).toEqual(['u2', 'u1']);
  });

  it('flattens reply target to root id', () => {
    const items = [
      item({ id: 'root', sortKey: 1, connectionState: 'connected' }),
      item({
        id: 'reply',
        sortKey: 2,
        parentId: 'root',
        connectionState: 'connected',
      }),
    ];
    expect(resolveReplyRootId('reply', items)).toBe('root');
    expect(resolveReplyRootId('root', items)).toBe('root');
  });

  it('validates empty vs text / audio / emoji-only send payloads', () => {
    expect(
      isComposerDraftEmpty({ text: '  ', bodyEmoji: null, audioUri: null }),
    ).toBe(true);
    expect(
      buildComposerSendPayload({ text: '  ', bodyEmoji: null, audioUri: null }),
    ).toBeNull();
    expect(
      buildComposerSendPayload({ text: 'hi', bodyEmoji: null, audioUri: null }),
    ).toEqual({ kind: 'text', text: 'hi' });
    expect(
      buildComposerSendPayload({
        text: '',
        bodyEmoji: '👍',
        audioUri: null,
      }),
    ).toEqual({ kind: 'emoji_only', emoji: '👍' });
    expect(
      buildComposerSendPayload({
        text: 'note',
        bodyEmoji: '👍',
        audioUri: 'file://clip.m4a',
      }),
    ).toEqual({
      kind: 'audio',
      audioUri: 'file://clip.m4a',
    });
    expect(
      buildComposerSendPayload({
        text: 'hi',
        bodyEmoji: '👍',
        audioUri: null,
      }),
    ).toEqual({ kind: 'text', text: 'hi' });
  });

  it('replaces or clears the one active reaction', () => {
    expect(nextReactionEmoji(null, '👍')).toBe('👍');
    expect(nextReactionEmoji('👍', '❤️')).toBe('❤️');
    expect(nextReactionEmoji('👍', '👍')).toBeNull();
  });
});
