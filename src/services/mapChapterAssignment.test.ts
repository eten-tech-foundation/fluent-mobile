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

  it('maps status from the /all endpoint payload', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 10,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 2,
      status: 'peer_check',
    });

    expect(mapped.chapterStatus).toBe('peer_check');
  });

  it('prefers chapterStatus when both status fields are present', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 11,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 3,
      chapterStatus: 'draft',
      status: 'peer_check',
    });

    expect(mapped.chapterStatus).toBe('draft');
  });
});
