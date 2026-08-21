import type { ChapterAssignmentData } from '../types/db/types';
import { isChapterTakenByOther } from './chapterTakenStatus';

const baseChapter: ChapterAssignmentData = {
  id: 1,
  projectUnitId: 1,
  projectId: 1,
  bibleId: 1,
  bookId: 1,
  chapterNumber: 1,
  status: 'draft',
};

describe('isChapterTakenByOther', () => {
  const currentUserId = 42;

  it('returns false when both assignee slots are empty', () => {
    expect(isChapterTakenByOther(baseChapter, currentUserId)).toBe(false);
  });

  it('returns false when current user is the Drafter', () => {
    expect(
      isChapterTakenByOther(
        { ...baseChapter, assignedUserId: currentUserId },
        currentUserId,
      ),
    ).toBe(false);
  });

  it('returns false when current user is the Peer Checker and someone else is Drafter', () => {
    expect(
      isChapterTakenByOther(
        {
          ...baseChapter,
          assignedUserId: 99,
          peerCheckerId: currentUserId,
        },
        currentUserId,
      ),
    ).toBe(false);
  });

  it('returns true when another Drafter is assigned and current user holds no slot', () => {
    expect(
      isChapterTakenByOther(
        { ...baseChapter, assignedUserId: 99 },
        currentUserId,
      ),
    ).toBe(true);
  });

  it('returns true when only another Peer Checker is assigned', () => {
    expect(
      isChapterTakenByOther(
        { ...baseChapter, peerCheckerId: 99 },
        currentUserId,
      ),
    ).toBe(true);
  });

  it('returns false when current user is Drafter and someone else is Peer Checker', () => {
    expect(
      isChapterTakenByOther(
        {
          ...baseChapter,
          assignedUserId: currentUserId,
          peerCheckerId: 99,
        },
        currentUserId,
      ),
    ).toBe(false);
  });

  it('returns false when current user id is missing', () => {
    expect(
      isChapterTakenByOther({ ...baseChapter, assignedUserId: 99 }, null),
    ).toBe(false);
  });
});
