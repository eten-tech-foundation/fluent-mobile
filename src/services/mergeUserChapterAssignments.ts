import { ChapterAssignment } from '../types/db/types';
import {
  ApiUserChapterAssignment,
  mapApiChapterAssignment,
} from './mapChapterAssignment';

const STATUS_PRIORITY: Record<string, number> = {
  peer_check: 3,
  draft: 2,
  not_started: 1,
};

function statusPriority(status?: string): number {
  return STATUS_PRIORITY[(status ?? '').trim().toLowerCase()] ?? 0;
}

/**
 * Merges assigned + peer-check API lists. When the same assignment appears in
 * both payloads, keeps the higher-priority workflow status (peer_check wins).
 */
export function mergeUserChapterAssignments(
  assigned: ApiUserChapterAssignment[] = [],
  peerCheck: ApiUserChapterAssignment[] = [],
): ChapterAssignment[] {
  const byId = new Map<number, ChapterAssignment>();

  for (const api of [...assigned, ...peerCheck]) {
    const mapped = mapApiChapterAssignment(api);
    const existing = byId.get(mapped.chapterAssignmentId);

    if (
      !existing ||
      statusPriority(mapped.chapterStatus) >
        statusPriority(existing.chapterStatus)
    ) {
      byId.set(mapped.chapterAssignmentId, mapped);
    }
  }

  return [...byId.values()];
}
