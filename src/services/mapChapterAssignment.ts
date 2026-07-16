import { ApiChapterAssignment } from '../types/api/types';
import { ChapterAssignment } from '../types/db/types';

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Number(value) || 0);
}

/** Persists API workflow values using the same snake_case keys as fluent-api. */
export function normalizeChapterStatus(
  status: string | null | undefined,
): string {
  const normalized = (status ?? '').trim().toLowerCase();
  return normalized || 'not_started';
}

export function mapApiChapterAssignment(
  api: ApiChapterAssignment,
): ChapterAssignment {
  return {
    chapterAssignmentId: api.chapterAssignmentId,
    projectUnitId: api.projectUnitId,
    projectId: api.projectId,
    bibleId: api.bibleId,
    bookId: api.bookId,
    chapterNumber: api.chapterNumber,
    assignedUserId:
      api.assignedUserId ??
      (api as { assigned_user_id?: number | null }).assigned_user_id ??
      undefined,
    peerCheckerId:
      api.peerCheckerId ??
      (api as { peer_checker_id?: number | null }).peer_checker_id ??
      undefined,
    chapterStatus: normalizeChapterStatus(api.chapterStatus ?? api.status),
    submittedTime: api.submittedTime ?? undefined,
    updatedAt: api.updatedAt ?? undefined,
    totalVerses: nonNegativeInt(api.totalVerses),
    completedVerses: nonNegativeInt(api.completedVerses),
  };
}
