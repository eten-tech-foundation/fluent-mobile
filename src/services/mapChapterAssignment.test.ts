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
      totalVerses: 0,
      completedVerses: 0,
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
      totalVerses: 0,
      completedVerses: 0,
    });

    expect(mapped.chapterStatus).toBe('draft');
  });

  it('maps snake_case assignee fields when camelCase is absent', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 12,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      status: 'not_started',
      assigned_user_id: 241,
      peer_checker_id: 99,
    } as Parameters<typeof mapApiChapterAssignment>[0]);

    expect(mapped.assignedUserId).toBe(241);
    expect(mapped.peerCheckerId).toBe(99);
  });
});
