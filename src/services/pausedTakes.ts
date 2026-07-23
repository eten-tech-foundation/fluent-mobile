import { deleteFile } from '../utils/audioStorage';
import { logger } from '../utils/logger';
import { kvStorage } from './storage';

const log = logger.create('pausedTakes');

export const PAUSED_TAKES_KV_KEY = 'paused_take_markers_v1';

export type PausedTakeMarker = {
  /** Session key — typically bibleTextId or chapterAssignmentId:verse */
  sessionKey: string;
  segments: string[];
  elapsedMs: number;
  startedAt: string;
  /** Optional navigation hints; if unresolvable, marker is orphaned. */
  chapterAssignmentId?: number;
  verseNumber?: number;
};

function readAll(): PausedTakeMarker[] {
  const raw = kvStorage.getItemSync(PAUSED_TAKES_KV_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PausedTakeMarker[]) : [];
  } catch {
    return [];
  }
}

function writeAll(markers: PausedTakeMarker[]): void {
  kvStorage.setItemSync(PAUSED_TAKES_KV_KEY, JSON.stringify(markers));
}

export function listPausedTakes(): PausedTakeMarker[] {
  return readAll();
}

export function upsertPausedTake(marker: PausedTakeMarker): void {
  const rest = readAll().filter(m => m.sessionKey !== marker.sessionKey);
  writeAll([...rest, marker]);
}

export function clearPausedTake(sessionKey: string): void {
  writeAll(readAll().filter(m => m.sessionKey !== sessionKey));
}

export function isPausedTakeOrphaned(marker: PausedTakeMarker): boolean {
  return (
    marker.verseNumber === undefined ||
    marker.verseNumber === null ||
    marker.chapterAssignmentId === undefined ||
    marker.chapterAssignmentId === null
  );
}

/**
 * Remove paused-take markers that cannot be recovered to a verse, and
 * best-effort delete their segment files (#170).
 */
export async function clearOrphanedPausedTakes(
  resolveNavigable: (marker: PausedTakeMarker) => boolean = marker =>
    !isPausedTakeOrphaned(marker),
): Promise<number> {
  const markers = readAll();
  const kept: PausedTakeMarker[] = [];
  let removed = 0;

  for (const marker of markers) {
    if (resolveNavigable(marker)) {
      kept.push(marker);
      continue;
    }
    removed += 1;
    for (const uri of marker.segments) {
      try {
        await deleteFile(uri);
      } catch (error) {
        log.warn('Failed to delete orphaned paused segment', { uri, error });
      }
    }
    log.info('Cleared orphaned paused take', {
      sessionKey: marker.sessionKey,
    });
  }

  writeAll(kept);
  return removed;
}

/** Clear all paused-take markers + segment files (Settings → Clear cache). */
export async function clearAllPausedTakes(): Promise<number> {
  const markers = readAll();
  for (const marker of markers) {
    for (const uri of marker.segments) {
      try {
        await deleteFile(uri);
      } catch (error) {
        log.warn('Failed to delete paused segment during clear cache', {
          uri,
          error,
        });
      }
    }
  }
  writeAll([]);
  return markers.length;
}
