import { mapApiChapterAssignment } from './mapChapterAssignment';

describe('mapApiChapterAssignment', () => {
  it('maps verse progress from the API payload', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 9,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      chapterStatus: 'draft',
      totalVerses: 5,
      completedVerses: 2,
    });

    expect(mapped.totalVerses).toBe(5);
    expect(mapped.completedVerses).toBe(2);
    expect(mapped.chapterStatus).toBe('draft');
  });
});
