import { Directory, File, Paths } from 'expo-file-system';
import { logger } from '../utils/logger';

const log = logger.create('recordingStorage');

/**
 * Durable on-disk layout for recordings, rooted at `Paths.document`:
 *
 *   recordings/u<userId>/p<projectId>/<BOOK>/c<chapter>/v<verse>/<recordingId>.<ext>
 *
 * The filename is the recording's UUID PK, so it is globally unique and never
 * needs renaming; multiple takes for a verse simply add files. The directory
 * tree partitions by user (isolation + single-directory wipe on logout) then by
 * the domain hierarchy (project -> book -> chapter -> verse) for browsability.
 *
 * Only a RELATIVE key (the part after `Paths.document`) is persisted in the DB;
 * `resolveRecordingUri` rebuilds the absolute uri at read time because the
 * document directory can change across reinstalls/updates.
 */
export const RECORDINGS_ROOT = 'recordings';
const DEFAULT_EXTENSION = 'm4a';

export interface RecordingKeyParts {
  userId: string;
  projectId: number;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  recordingId: string;
  extension?: string;
}

export interface MoveIntoStoreArgs {
  sourceUri: string;
  key: string;
}

export interface MoveIntoStoreResult {
  key: string;
  sizeBytes: number | null;
}

function pad3(value: number): string {
  return String(value).padStart(3, '0');
}

/** Keeps path segments filesystem-safe without collapsing distinct values. */
function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Extracts a lowercase file extension from a uri, falling back to `.m4a`. */
export function extensionFromUri(
  uri: string,
  fallback: string = DEFAULT_EXTENSION,
): string {
  const match = /\.([a-zA-Z0-9]+)(?:[?#].*)?$/.exec(uri);
  return match ? match[1]!.toLowerCase() : fallback;
}

/** Ordered path segments (relative to the document directory) for a recording. */
export function recordingKeySegments(parts: RecordingKeyParts): string[] {
  return [
    RECORDINGS_ROOT,
    `u${sanitizeSegment(parts.userId || 'unknown')}`,
    `p${parts.projectId}`,
    sanitizeSegment(parts.bookCode || 'UNK').toUpperCase(),
    `c${pad3(parts.chapterNumber)}`,
    `v${pad3(parts.verseNumber)}`,
    `${sanitizeSegment(parts.recordingId)}.${
      parts.extension ?? DEFAULT_EXTENSION
    }`,
  ];
}

/** Relative storage key persisted in `recordings.local_file_path`. */
export function buildRecordingKey(parts: RecordingKeyParts): string {
  return recordingKeySegments(parts).join('/');
}

/**
 * Resolves a stored value to an absolute uri for playback/upload. Relative keys
 * are joined against the document directory; already-absolute paths (legacy rows
 * written before durable storage) are returned unchanged.
 */
export function resolveRecordingUri(pathOrKey: string): string {
  if (pathOrKey.startsWith('file:') || pathOrKey.startsWith('/')) {
    return pathOrKey;
  }
  return new File(Paths.document, ...pathOrKey.split('/')).uri;
}

/**
 * Moves a freshly recorded file out of the (evictable) cache into the durable
 * document tree at `key`, creating intermediate directories as needed. Returns
 * the final key and the file size once settled.
 */
export async function moveIntoStore({
  sourceUri,
  key,
}: MoveIntoStoreArgs): Promise<MoveIntoStoreResult> {
  const segments = key.split('/');
  const fileName = segments[segments.length - 1]!;
  const dirSegments = segments.slice(0, -1);

  const destDir = new Directory(Paths.document, ...dirSegments);
  destDir.create({ intermediates: true, idempotent: true });

  const source = new File(sourceUri);
  const dest = new File(destDir, fileName);
  await source.move(dest);

  const size = dest.size;
  return { key, sizeBytes: typeof size === 'number' ? size : null };
}

/** Best-effort unlink of a stored recording file. Never throws. */
export function deleteRecordingFile(pathOrKey: string): void {
  try {
    const file = new File(resolveRecordingUri(pathOrKey));
    if (file.exists) file.delete();
  } catch (error) {
    log.warn('Failed to delete recording file', { pathOrKey, error });
  }
}

/** Best-effort removal of a user's entire recordings subtree (e.g. on logout). */
export function deleteUserTree(userId: string): void {
  try {
    const dir = new Directory(
      Paths.document,
      RECORDINGS_ROOT,
      `u${sanitizeSegment(userId || 'unknown')}`,
    );
    if (dir.exists) dir.delete();
  } catch (error) {
    log.warn('Failed to delete user recordings tree', { userId, error });
  }
}
