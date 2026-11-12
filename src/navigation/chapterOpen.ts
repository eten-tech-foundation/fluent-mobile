import { getChapterAssignmentById } from '../db/queries';
import { isUserProjectMember } from '../db/repository';
import { getActiveUserId } from '../services/storage';
import { getObserverProjectIds } from '../services/userOrgGrants';
import { classifyMyWorkListAccess } from '../utils/myWorkChapterFilter';
import { getTranslatorProjectIds } from '../utils/myWorkDraftDownload';
import { parseUserId } from '../utils/parseUserId';
import {
  getObserverDraftDestination,
  type ObserverDraftHref,
} from './observerDraft';

/**
 * Where a chapter tap goes. `work`: the editable drafting surface (assigned,
 * or an open Peer Check with a live Translator grant). `observer`: the
 * read-only Observer draft, never the editable one. `view`: none of those;
 * Next still opens the passage to read, and recording there checks itself.
 */
export type ChapterOpen =
  | { kind: 'work' }
  | { kind: 'observer'; href: ObserverDraftHref }
  | { kind: 'view' };

export interface ChapterOpenInput {
  chapterId: number;
  projectId: number;
  assignmentStatus: string;
  assignedUserId: number | null | undefined;
  peerCheckerId: number | null | undefined;
  hasPendingStageAdvance?: boolean;
}

/** The active account is still the synced one it was when the tap began. */
function sameAccount(userId: number): boolean {
  const raw = getActiveUserId();
  const synced = parseUserId();
  return (
    !!raw && synced !== null && raw === String(synced) && synced === userId
  );
}

function stillObserver(userId: number, projectId: number): boolean {
  return (
    sameAccount(userId) &&
    getObserverProjectIds(String(userId)).includes(projectId)
  );
}

/**
 * Reclassifies from the live account and grants, since a list's snapshot
 * may be stale, and re-checks across every await. Null means stop: the
 * account changed, the tap was superseded (`isCurrent` false), or Observer
 * access couldn't be confirmed, which must not fall back to editing.
 */
export async function resolveChapterOpen(
  chapter: ChapterOpenInput,
  isCurrent: () => boolean,
): Promise<ChapterOpen | null> {
  const activeRaw = getActiveUserId();
  const userId = parseUserId();
  if (!activeRaw || userId === null || activeRaw !== String(userId)) {
    return null;
  }
  const access = classifyMyWorkListAccess({
    userId,
    assignmentStatus: chapter.assignmentStatus,
    assignedUserId: chapter.assignedUserId,
    peerCheckerId: chapter.peerCheckerId,
    projectId: chapter.projectId,
    grantProjectIds: getObserverProjectIds(String(userId)),
    translatorProjectIds: getTranslatorProjectIds(String(userId)),
    // A stale `true` after a drain only opens drafting, which re-checks.
    hasPendingStageAdvance: chapter.hasPendingStageAdvance,
  });
  if (access === null) return { kind: 'view' };

  if (access === 'observer') {
    // The grant snapshot alone isn't enough; re-check membership too.
    const member = await isUserProjectMember(userId, chapter.projectId);
    if (!isCurrent() || !member || !stillObserver(userId, chapter.projectId)) {
      return null;
    }
    const href = await getObserverDraftDestination({
      chapterAssignmentId: chapter.chapterId,
      projectId: chapter.projectId,
    });
    if (
      !isCurrent() ||
      href === null ||
      !stillObserver(userId, chapter.projectId)
    ) {
      return null;
    }
    const memberAfter = await isUserProjectMember(userId, chapter.projectId);
    if (
      !isCurrent() ||
      !memberAfter ||
      !stillObserver(userId, chapter.projectId)
    ) {
      return null;
    }
    return { kind: 'observer', href };
  }

  // Open Peer Check: re-check the Translator grant right before navigating.
  if (
    access === 'open_peer' &&
    !getTranslatorProjectIds(String(userId)).includes(chapter.projectId)
  ) {
    return null;
  }
  return { kind: 'work' };
}

/** `resolveChapterOpen` for a chapter known only by id, e.g. the book page. */
export async function resolveAssignmentOpen(
  chapterId: number,
  isCurrent: () => boolean,
): Promise<ChapterOpen | null> {
  const assignment = await getChapterAssignmentById(chapterId);
  if (!isCurrent() || assignment === null || assignment.projectId === null) {
    return null;
  }
  return resolveChapterOpen(
    {
      chapterId,
      projectId: assignment.projectId,
      assignmentStatus: assignment.status,
      assignedUserId: assignment.assignedUserId,
      peerCheckerId: assignment.peerCheckerId,
    },
    isCurrent,
  );
}
