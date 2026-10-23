import {
  commentCountForAnchor,
  countCommentsByBibleTextId,
  countCommentsByPericopeNumber,
  filterCommentsForDrawer,
} from './chapterCommentPresentation';
import type { ChapterComment } from '../types/api/chapterComments';

function comment(
  partial: Partial<ChapterComment> &
    Pick<ChapterComment, 'id' | 'connectionState'> & {
      anchor: ChapterComment['anchor'];
    },
): ChapterComment {
  return {
    projectId: 1,
    chapterAssignmentId: 9,
    parentCommentId: null,
    author: {
      userId: 7,
      displayName: 'Ada',
      roleDisplay: 'Observer',
    },
    createdAt: '2026-10-22T12:00:00.000Z',
    bodyKind: 'text',
    text: 'hi',
    emoji: null,
    audio: null,
    reactions: [],
    currentUserReaction: null,
    ...partial,
  };
}

const verseAnchor = {
  kind: 'verse' as const,
  bibleId: 1,
  bookId: 40,
  chapterNumber: 1,
  bibleTextId: 401,
  verseNumber: 2,
  pericopeSetId: null,
  pericopeNumber: null,
  pericopeTitle: null,
};

const pericopeAnchor = {
  kind: 'pericope' as const,
  bibleId: 1,
  bookId: 40,
  chapterNumber: 1,
  bibleTextId: null,
  verseNumber: null,
  pericopeSetId: 3,
  pericopeNumber: '1.2',
  pericopeTitle: 'Title',
};

describe('chapterCommentPresentation anchors', () => {
  const rows = [
    comment({
      id: 1,
      connectionState: 'connected',
      anchor: verseAnchor,
    }),
    comment({
      id: 2,
      connectionState: 'connected',
      anchor: pericopeAnchor,
    }),
    comment({
      id: 3,
      connectionState: 'unconnected',
      anchor: { ...verseAnchor, bibleTextId: 999 },
    }),
  ];

  it('counts verse and pericope maps separately', () => {
    expect(countCommentsByBibleTextId(rows).get(401)).toBe(1);
    expect(countCommentsByBibleTextId(rows).has(999)).toBe(true);
    expect(countCommentsByPericopeNumber(rows).get('1.2')).toBe(1);
    expect(
      commentCountForAnchor(rows, { kind: 'verse', bibleTextId: 401 }),
    ).toBe(1);
    expect(
      commentCountForAnchor(rows, { kind: 'pericope', pericopeNumber: '1.2' }),
    ).toBe(1);
    expect(
      commentCountForAnchor(rows, { kind: 'verse', bibleTextId: 404 }),
    ).toBeNull();
  });

  it('filters drawer by verse or pericope and keeps all Unconnected', () => {
    const verseFiltered = filterCommentsForDrawer(rows, {
      kind: 'verse',
      bibleTextId: 401,
    });
    expect(verseFiltered.map(c => c.id)).toEqual([1, 3]);

    const pericopeFiltered = filterCommentsForDrawer(rows, {
      kind: 'pericope',
      pericopeNumber: '1.2',
    });
    expect(pericopeFiltered.map(c => c.id)).toEqual([2, 3]);
  });
});
