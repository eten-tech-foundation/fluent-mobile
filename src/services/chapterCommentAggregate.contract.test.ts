import wireContract from './fixtures/chapterCommentAggregate.wire-contract.json';
import { parseChapterCommentAggregate } from '../types/api/chapterCommentAggregate';

/**
 * Pinned fluent-api PR #459 wire contract
 * (head 40fa2e5657fc91cbac24c3473fd572e702db0684).
 * No live HTTP / API edits.
 */
describe('chapter comment-aggregate contract (API459 pinned)', () => {
  it('pins the published API459 baseline and fixture provenance labels', () => {
    expect(wireContract.baseline).toMatchObject({
      issue: 458,
      pr459Head: '40fa2e5657fc91cbac24c3473fd572e702db0684',
      endpoint:
        'GET /chapter-assignments/{chapterAssignmentId}/comment-aggregate',
      schemaExport: 'chapterCommentAggregateSchema',
      httpFixtureAtPin: false,
    });
    expect(wireContract.examples.serviceUnitTestExtracted.provenance).toMatch(
      /Extracted from draft-comments\.service\.test\.ts/,
    );
    expect(wireContract.examples.schemaDerivedZeroFalse.provenance).toMatch(
      /Schema-derived/,
    );
  });

  it('accepts the service-test extracted count4/false payload', () => {
    const payload = wireContract.examples.serviceUnitTestExtracted.payload;
    expect(parseChapterCommentAggregate(payload, 9)).toEqual({
      chapterAssignmentId: 9,
      commentCount: 4,
      currentUserHasCommented: false,
    });
  });

  it('accepts schema-derived verified zero/false', () => {
    const payload = wireContract.examples.schemaDerivedZeroFalse.payload;
    expect(parseChapterCommentAggregate(payload, 1)).toEqual({
      chapterAssignmentId: 1,
      commentCount: 0,
      currentUserHasCommented: false,
    });
  });

  it('rejects id mismatch and invalid shapes without coercing', () => {
    expect(
      parseChapterCommentAggregate(
        wireContract.examples.serviceUnitTestExtracted.payload,
        8,
      ),
    ).toBeNull();
    expect(
      parseChapterCommentAggregate({
        chapterAssignmentId: 9,
        commentCount: 4,
      }),
    ).toBeNull();
    expect(
      parseChapterCommentAggregate({
        chapterAssignmentId: 0,
        commentCount: 0,
        currentUserHasCommented: false,
      }),
    ).toBeNull();
    expect(
      parseChapterCommentAggregate({
        chapterAssignmentId: 9,
        commentCount: -1,
        currentUserHasCommented: false,
      }),
    ).toBeNull();
    expect(
      parseChapterCommentAggregate({
        chapterAssignmentId: '9',
        commentCount: 4,
        currentUserHasCommented: false,
      }),
    ).toBeNull();
  });
});
