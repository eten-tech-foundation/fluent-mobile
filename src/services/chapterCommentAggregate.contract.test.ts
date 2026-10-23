import wireContract from './fixtures/chapterCommentAggregate.wire-contract.json';
import { parseChapterCommentAggregate } from '../types/api/chapterCommentAggregate';

/**
 * Pinned fluent-api PR #459 wire contract
 * (tip dfad78d7438caad4391ad77d2e442e7c921f88e1).
 * No live HTTP / API edits.
 */
describe('chapter comment-aggregate contract (API459 pinned)', () => {
  it('pins the published API459 tip baseline and fixture provenance labels', () => {
    expect(wireContract.baseline).toMatchObject({
      issue: 458,
      pr459Head: 'dfad78d7438caad4391ad77d2e442e7c921f88e1',
      endpoint:
        'GET /chapter-assignments/{chapterAssignmentId}/comment-aggregate',
      schemaExport: 'chapterCommentAggregateSchema',
      httpFixtureAtPin: false,
    });
    expect(wireContract.baseline.pr459Heads).toMatchObject({
      tip: 'dfad78d7438caad4391ad77d2e442e7c921f88e1',
      lockSerialize: 'd2637641478eda0ffde8b47cbb1cf949afbee0df',
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
