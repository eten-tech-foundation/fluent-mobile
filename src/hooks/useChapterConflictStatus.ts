import { isDevPreviewChapterConflictEnabled } from '../config/devPreviewChapterConflict';

/** Placeholder until fluent-api#271's conflict data model lands (#260 consumes the same source). */
export function useChapterConflictStatus(chapterAssignmentId: number): {
  hasConflict: boolean;
} {
  void chapterAssignmentId;

  if (isDevPreviewChapterConflictEnabled()) {
    return { hasConflict: true };
  }

  return { hasConflict: false };
}
