import wireContract from './fixtures/chapterComments.wire-contract.json';
import {
  parseChapterComment,
  parseListChapterCommentsResponse,
} from '../types/api/chapterComments';

/**
 * Pinned fluent-api PR #459 chapter comments wire contract
 * (tip dfad78d7438caad4391ad77d2e442e7c921f88e1).
 * Schema-derived examples only — httpFixtureAtPin: false (no live HTTP).
 */
describe('chapter comments contract (API459 tip pinned)', () => {
  it('pins tip/lock heads, routes, and no live HTTP claim', () => {
    expect(wireContract.baseline).toMatchObject({
      issue: 458,
      httpFixtureAtPin: false,
    });
    expect(wireContract.baseline.pr459Heads).toEqual({
      lockSerialize: 'd2637641478eda0ffde8b47cbb1cf949afbee0df',
      tip: 'dfad78d7438caad4391ad77d2e442e7c921f88e1',
    });
    expect(wireContract.baseline.routes).toEqual(
      expect.arrayContaining([
        'GET /chapter-assignments/{chapterAssignmentId}/comments',
        'POST /chapter-assignments/{chapterAssignmentId}/comments',
        'POST /chapter-assignments/{chapterAssignmentId}/comments/audio',
        'POST /chapter-assignments/{chapterAssignmentId}/comments/replies',
        'PUT /chapter-assignments/{chapterAssignmentId}/comments/{commentId}/reaction',
        'DELETE /chapter-assignments/{chapterAssignmentId}/comments/{commentId}/reaction',
      ]),
    );
  });

  it('parses schema-derived empty list', () => {
    expect(
      parseListChapterCommentsResponse(
        wireContract.examples.listEmpty.payload,
        9,
      ),
    ).toEqual({ connected: [], unconnected: [] });
  });

  it('parses schema-shaped text comment without coercing', () => {
    const payload = wireContract.examples.textComment.payload;
    expect(parseChapterComment(payload, 9)).toMatchObject({
      id: 11,
      chapterAssignmentId: 9,
      bodyKind: 'text',
      text: 'Please check verse 2',
      emoji: null,
      audio: null,
      connectionState: 'connected',
      currentUserReaction: null,
    });
  });

  it('rejects chapter id mismatch on list parse', () => {
    expect(
      parseListChapterCommentsResponse(
        {
          connected: [wireContract.examples.textComment.payload],
          unconnected: [],
        },
        8,
      ),
    ).toBeNull();
  });
});
