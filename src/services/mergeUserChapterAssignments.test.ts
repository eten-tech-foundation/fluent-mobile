import { mergeUserChapterAssignments } from './mergeUserChapterAssignments';

describe('mergeUserChapterAssignments', () => {
  it('dedupes by id and prefers peer_check over draft', () => {
    const merged = mergeUserChapterAssignments(
      [
        {
          chapterAssignmentId: 1,
          projectId: 1,
          projectUnitId: 1,
          bibleId: 1,
          bookId: 1,
          chapterNumber: 1,
          chapterStatus: 'draft',
        },
      ],
      [
        {
          chapterAssignmentId: 1,
          projectId: 1,
          projectUnitId: 1,
          bibleId: 1,
          bookId: 1,
          chapterNumber: 1,
          chapterStatus: 'peer_check',
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].chapterStatus).toBe('peer_check');
  });

  it('normalizes status casing from the API', () => {
    const merged = mergeUserChapterAssignments([
      {
        chapterAssignmentId: 2,
        projectId: 1,
        projectUnitId: 1,
        bibleId: 1,
        bookId: 2,
        chapterNumber: 3,
        chapterStatus: 'DRAFT',
      },
    ]);

    expect(merged[0].chapterStatus).toBe('draft');
  });
});
