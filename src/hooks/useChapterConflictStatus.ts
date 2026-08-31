import { useEffect, useState } from 'react';
import { isDevPreviewChapterConflictEnabled } from '../config/devPreviewChapterConflict';
import { getChapterHasConflict } from '../db/queries';

/** Reads chapter-level `has_conflict` from SQLite (synced via fluent-api#271). */
export function useChapterConflictStatus(chapterAssignmentId: number): {
  hasConflict: boolean;
} {
  const previewEnabled = isDevPreviewChapterConflictEnabled();
  const [hasConflict, setHasConflict] = useState(previewEnabled);

  useEffect(() => {
    let cancelled = false;

    if (previewEnabled) {
      setHasConflict(true);
      return () => {
        cancelled = true;
      };
    }

    setHasConflict(false);

    void getChapterHasConflict(chapterAssignmentId).then(value => {
      if (!cancelled) {
        setHasConflict(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chapterAssignmentId, previewEnabled]);

  return { hasConflict };
}
