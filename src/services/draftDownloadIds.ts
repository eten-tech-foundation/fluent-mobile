/** Stable raw resource ids (before project/user scoping in download_queue). */

export const DRAFT_DOWNLOAD_RESOURCE_NAME = 'Draft Chapter';

export const DRAFT_AUDIO_RESOURCE_PREFIX = 'draft-audio-';
export const DRAFT_TEXT_RESOURCE_PREFIX = 'draft-text-';
export const DRAFT_SCRIPTURE_RESOURCE_PREFIX = 'draft-scripture-';

/** Keep contentHash path-safe for downloadStorage SAFE_SEGMENT. */
export function safeContentHashSegment(contentHash: string): string {
  const cleaned = contentHash.replace(/[^A-Za-z0-9_-]/g, '');
  if (!cleaned) {
    throw new Error('contentHash has no path-safe characters');
  }
  return cleaned.slice(0, 48);
}

/**
 * Bind queue identity to exact selected take + content hash so a take change
 * cannot reuse stale completed bytes or resume into the wrong partial.
 */
export function draftAudioResourceId(
  chapterAssignmentId: number,
  bibleTextId: number,
  activeTakeId: number,
  contentHash: string,
): string {
  const hash = safeContentHashSegment(contentHash);
  return `${DRAFT_AUDIO_RESOURCE_PREFIX}${chapterAssignmentId}-${bibleTextId}-t${activeTakeId}-${hash}`;
}

export function draftTextResourceId(chapterAssignmentId: number): string {
  return `${DRAFT_TEXT_RESOURCE_PREFIX}${chapterAssignmentId}`;
}

export function draftScriptureResourceId(chapterAssignmentId: number): string {
  return `${DRAFT_SCRIPTURE_RESOURCE_PREFIX}${chapterAssignmentId}`;
}

export function isDraftAudioResourceId(resourceId: string): boolean {
  return resourceId.startsWith(DRAFT_AUDIO_RESOURCE_PREFIX);
}

export function isDraftChapterResourceId(
  resourceId: string,
  chapterAssignmentId: number,
): boolean {
  const audioPrefix = `${DRAFT_AUDIO_RESOURCE_PREFIX}${chapterAssignmentId}-`;
  const textId = draftTextResourceId(chapterAssignmentId);
  const scriptureId = draftScriptureResourceId(chapterAssignmentId);
  return (
    resourceId === textId ||
    resourceId === scriptureId ||
    resourceId.startsWith(audioPrefix)
  );
}

export function draftSessionKey(args: {
  userId: number;
  projectId: number;
  chapterAssignmentId: number;
  role: string;
}): string {
  return `${args.userId}:${args.projectId}:${args.chapterAssignmentId}:${args.role}`;
}
