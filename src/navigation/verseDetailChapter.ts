import { getChapterAssignmentById, getChapterRouteNames } from '../db/queries';
import { resolveAssignmentOpen } from './chapterOpen';
import { hrefs } from './hrefs';
import type { ObserverDraftHref } from './observerDraft';
import type { VerseDetailChapter } from './verseDetailLink';

export type VerseDetailChapterResult =
  | {
      kind: 'passage';
      href: ReturnType<typeof hrefs.passage>;
    }
  | { kind: 'observer'; href: ObserverDraftHref }
  | { kind: 'missing' }
  | { kind: 'unread' }
  | { kind: 'stale' };

/**
 * A chapter link has no verse. Next opens the passage that contains verse 1,
 * which is where a chapter starts. The page then follows the saved drafting
 * unit, the same way Home and the book page open a chapter.
 */
const CHAPTER_LINK_ANCHOR_VERSE = 1;

/**
 * The Next destination for a chapter link. An observer goes to the read-only
 * screen. Everyone else goes to the passage, with the names read from the
 * chapter rather than the link, and without recovery parameters. A missing
 * chapter, a chapter with no project, an unreadable name, or an account
 * change does not open an editor.
 */
export async function openVerseDetailChapter(
  link: VerseDetailChapter,
  isCurrent: () => boolean = () => true,
): Promise<VerseDetailChapterResult> {
  if (!isCurrent()) return { kind: 'stale' };
  const assignment = await getChapterAssignmentById(link.chapterId);
  if (!isCurrent()) return { kind: 'stale' };
  if (!assignment) return { kind: 'missing' };
  // No project: Observer access cannot be confirmed, so this must not open
  // the editor. Same stop as resolveAssignmentOpen.
  if (assignment.projectId === null) return { kind: 'stale' };

  const open = await resolveAssignmentOpen(link.chapterId, isCurrent);
  if (!isCurrent()) return { kind: 'stale' };
  // Null means the account changed or Observer access could not be
  // confirmed. Do not fall through to the editor.
  if (open === null) return { kind: 'stale' };
  if (open.kind === 'observer') return { kind: 'observer', href: open.href };

  const names = await getChapterRouteNames(link.chapterId);
  if (!isCurrent()) return { kind: 'stale' };
  if (!names) return { kind: 'unread' };
  const chapterName = `${assignment.bookName ?? ''} ${
    assignment.chapterNumber
  }`.trim();
  return {
    kind: 'passage',
    href: hrefs.passage({
      chapterId: link.chapterId,
      anchorVerse: CHAPTER_LINK_ANCHOR_VERSE,
      projectId: assignment.projectId,
      projectUnitId: assignment.projectUnitId,
      chapterName,
      ...names,
    }),
  };
}
