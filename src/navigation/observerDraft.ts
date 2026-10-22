import { resolveObserverDraftChapterAccess } from '../services/observerDraftChapter';

export type ObserverDraftHref = {
  pathname: '/(app)/(stack)/observer-draft';
  params: {
    chapterAssignmentId: string;
    projectId: string;
  };
};

/**
 * Destination guard for Observer read-only draft. Reads the current active
 * account + exact Project Observer grant + local assignment project match;
 * rechecks after async. Returns null when access is unknown/denied.
 * Callers must not pass role/status identity — this helper derives it.
 */
export async function getObserverDraftDestination(input: {
  chapterAssignmentId: number;
  projectId: number;
}): Promise<ObserverDraftHref | null> {
  const access = await resolveObserverDraftChapterAccess(input);
  if (!access.ok) {
    return null;
  }
  return {
    pathname: '/(app)/(stack)/observer-draft',
    params: {
      chapterAssignmentId: String(input.chapterAssignmentId),
      projectId: String(input.projectId),
    },
  };
}
