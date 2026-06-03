import { ChapterAssignment } from '../types/db/types';

/** Shape returned by GET /users/:id/chapter-assignments */
export interface ApiUserChapterAssignment {
  chapterAssignmentId: number;
  projectId: number;
  projectUnitId: number;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  chapterStatus?: string;
  assignedUserId?: number | null;
  peerCheckerId?: number | null;
  submittedTime?: string | null;
  updatedAt?: string | null;
  totalVerses?: number;
  completedVerses?: number;
}

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

export function mapApiChapterAssignment(
  api: ApiUserChapterAssignment,
): ChapterAssignment {
  return {
    chapterAssignmentId: api.chapterAssignmentId,
    projectUnitId: api.projectUnitId,
    projectId: api.projectId,
    bibleId: api.bibleId,
    bookId: api.bookId,
    chapterNumber: api.chapterNumber,
    assignedUserId: api.assignedUserId ?? undefined,
    chapterStatus: api.chapterStatus,
    submittedTime: api.submittedTime ?? undefined,
    updatedAt: api.updatedAt ?? undefined,
    totalVerses: nonNegativeInt(api.totalVerses),
    completedVerses: nonNegativeInt(api.completedVerses),
  };
}
