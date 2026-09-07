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

  it('maps snake_case project_id when camelCase is absent', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 13,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      status: 'not_started',
      project_id: 42,
    } as unknown as Parameters<typeof mapApiChapterAssignment>[0]);

    expect(mapped.projectId).toBe(42);
  });

  it('defaults projectId to 0 when camelCase and snake_case are absent', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 14,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      status: 'not_started',
    } as unknown as Parameters<typeof mapApiChapterAssignment>[0]);

    expect(mapped.projectId).toBe(0);
  });

  it('maps hasConflict when the API provides a boolean', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 15,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      chapterStatus: 'draft',
      hasConflict: true,
    });

    expect(mapped.hasConflict).toBe(true);
  });

  it('omits hasConflict when the API payload does not include it', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 16,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      status: 'draft',
    });

    expect(mapped.hasConflict).toBeUndefined();
  });

  it('maps hasClaimConflict when only the claim conflict flag is set', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 17,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      chapterStatus: 'draft',
      hasClaimConflict: true,
    });

    expect(mapped.hasConflict).toBe(true);
  });

  it('maps has_claim_conflict from snake_case payloads', () => {
    const mapped = mapApiChapterAssignment({
      chapterAssignmentId: 18,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      chapterStatus: 'draft',
      has_claim_conflict: true,
    } as Parameters<typeof mapApiChapterAssignment>[0]);

    expect(mapped.hasConflict).toBe(true);
  });

  it('ORs audio-take hasConflict with claim conflict', () => {
    const audioOnly = mapApiChapterAssignment({
      chapterAssignmentId: 19,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 1,
      chapterStatus: 'draft',
      hasConflict: true,
      hasClaimConflict: false,
    });
    const claimOnly = mapApiChapterAssignment({
      chapterAssignmentId: 20,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 2,
      chapterStatus: 'draft',
      hasConflict: false,
      hasClaimConflict: true,
    });
    const bothFalse = mapApiChapterAssignment({
      chapterAssignmentId: 21,
      projectId: 2,
      projectUnitId: 2,
      bibleId: 4,
      bookId: 12,
      chapterNumber: 3,
      chapterStatus: 'draft',
      hasConflict: false,
      hasClaimConflict: false,
    });

    expect(audioOnly.hasConflict).toBe(true);
    expect(claimOnly.hasConflict).toBe(true);
    expect(bothFalse.hasConflict).toBe(false);
  });
});
