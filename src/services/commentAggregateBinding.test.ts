import {
  clearBoundCommentAggregates,
  invalidateBoundCommentAggregateRefresh,
  readBoundCommentAggregate,
  refreshBoundCommentAggregates,
} from './commentAggregateBinding';
import {
  clearMyWorkCommentAggregates,
  getCommentAggregateCacheEntry,
  invalidateMyWorkCommentAggregateRefresh,
  refreshMyWorkCommentAggregates,
} from './myWorkCommentAggregates';

jest.mock('./myWorkCommentAggregates', () => ({
  getCommentAggregateCacheEntry: jest.fn(),
  refreshMyWorkCommentAggregates: jest.fn(async () => undefined),
  invalidateMyWorkCommentAggregateRefresh: jest.fn(),
  clearMyWorkCommentAggregates: jest.fn(),
}));

describe('commentAggregateBinding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads through the PR #792 fail-closed cache helper', () => {
    (getCommentAggregateCacheEntry as jest.Mock).mockReturnValue({
      status: 'known',
      commentCount: 4,
      currentUserHasCommented: false,
    });

    expect(readBoundCommentAggregate('7', 9)).toEqual({
      status: 'known',
      commentCount: 4,
      currentUserHasCommented: false,
    });
    expect(getCommentAggregateCacheEntry).toHaveBeenCalledWith('7', 9);
  });

  it('refreshes / invalidates / clears via PR #792 helpers only', async () => {
    await refreshBoundCommentAggregates({
      userId: '7',
      sessionToken: 'tok',
      chapterAssignmentIds: [9],
    });
    expect(refreshMyWorkCommentAggregates).toHaveBeenCalledWith({
      userId: '7',
      sessionToken: 'tok',
      chapterAssignmentIds: [9],
    });

    invalidateBoundCommentAggregateRefresh('7');
    expect(invalidateMyWorkCommentAggregateRefresh).toHaveBeenCalledWith('7');

    clearBoundCommentAggregates('7');
    expect(clearMyWorkCommentAggregates).toHaveBeenCalledWith('7');
  });
});
