import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
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

const RESERVED_SEGMENTS = new Set(['', '.', '..']);

function isReservedSegment(segment: string): boolean {
  return RESERVED_SEGMENTS.has(segment);
}

/** Keeps path segments filesystem-safe without collapsing distinct values. */
function sanitizeSegment(value: string, fallback = 'unknown'): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '_');
  return isReservedSegment(sanitized) ? fallback : sanitized;
}

/** Rejects reserved segments before passing paths to Directory/File constructors. */
function assertSafePathSegments(segments: string[]): void {
  for (const segment of segments) {
    if (isReservedSegment(segment)) {
      throw new Error(`Invalid recording path segment: "${segment}"`);
    }
  }
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
    `u${sanitizeSegment(parts.userId, 'unknown')}`,
    `p${parts.projectId}`,
    sanitizeSegment(parts.bookCode, 'UNK').toUpperCase(),
    `c${pad3(parts.chapterNumber)}`,
    `v${pad3(parts.verseNumber)}`,
    `${sanitizeSegment(parts.recordingId, 'unknown')}.${
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
  const segments = pathOrKey.split('/');
  assertSafePathSegments(segments);
  return new File(Paths.document, ...segments).uri;
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
  assertSafePathSegments(segments);
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

/**
 * Concatenates ordered ADTS AAC (`.aac`) segments into a single file. ADTS is a
 * self-framing bitstream, so a plain byte append yields a valid, playable file
 * — this is what lets a take span multiple recording sessions (including ones
 * separated by a process kill). A single segment is returned unchanged (the
 * caller moves it into durable storage directly, so no copy is needed).
 *
 * The merged file is written to the document directory; the caller is
 * responsible for moving it into the durable tree and unlinking the raw
 * segments afterwards.
 */
export async function concatenateAacSegments(
  fileUris: string[],
): Promise<string> {
  if (fileUris.length === 0) {
    throw new Error('concatenateAacSegments requires at least one segment');
  }
  if (fileUris.length === 1) {
    return fileUris[0]!;
  }

  const merged = new File(Paths.document, `merge-${randomUUID()}.aac`);
  try {
    merged.create({ intermediates: true, overwrite: true });
    for (const uri of fileUris) {
      const bytes = await new File(uri).bytes();
      merged.write(bytes, { append: true });
    }
    return merged.uri;
  } catch (error) {
    try {
      if (merged.exists) merged.delete();
    } catch (cleanupError) {
      log.warn('Failed to delete partial merged AAC file', {
        uri: merged.uri,
        error: cleanupError,
      });
    }
    throw error;
  }
}

/**
 * ADTS `sampling_frequency_index` -> sample rate (Hz). Indices 13-15 are
 * reserved/explicit and unused by our recorder, so they terminate parsing.
 */
const ADTS_SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
  8000, 7350,
] as const;

/** Samples per AAC raw data block (fixed by the codec). */
const SAMPLES_PER_BLOCK = 1024;

/** Minimum ADTS header size in bytes (7 without CRC, 9 with). */
const ADTS_MIN_HEADER = 7;

/**
 * Computes the exact playable duration (ms) of an ADTS AAC bitstream by walking
 * its frame headers. Every ADTS frame carries a fixed sample count
 * (`1024 * raw_data_blocks`), so summing across frames yields a sample-accurate
 * length that is independent of the wall-clock timer (which undercounts,
 * especially after a process kill). Parsing stops cleanly on a lost sync,
 * reserved sample-rate index, or truncated tail; returns `0` when no valid
 * frame is found (caller should fall back to the timer value).
 */
export function aacDurationMsFromBytes(bytes: Uint8Array): number {
  let seconds = 0;
  let i = 0;
  const end = bytes.length;

  while (i + ADTS_MIN_HEADER <= end) {
    const syncOk = bytes[i] === 0xff && (bytes[i + 1]! & 0xf0) === 0xf0;
    if (!syncOk) break;

    const sampleRateIndex = (bytes[i + 2]! & 0x3c) >> 2;
    const sampleRate = ADTS_SAMPLE_RATES[sampleRateIndex];
    if (sampleRate === undefined) break;

    const frameLength =
      ((bytes[i + 3]! & 0x03) << 11) |
      (bytes[i + 4]! << 3) |
      ((bytes[i + 5]! & 0xe0) >> 5);
    if (frameLength < ADTS_MIN_HEADER || i + frameLength > end) break;

    const rawBlocks = bytes[i + 6]! & 0x03;
    const samples = SAMPLES_PER_BLOCK * (rawBlocks + 1);
    seconds += samples / sampleRate;
    i += frameLength;
  }

  return Math.round(seconds * 1000);
}

/**
 * Reads an ADTS AAC file and returns its duration (ms) via
 * {@link aacDurationMsFromBytes}. Returns `0` on any read/parse failure so
 * callers can fall back to a timer-derived value.
 */
export async function aacDurationMs(fileUri: string): Promise<number> {
  try {
    const bytes = await new File(fileUri).bytes();
    return aacDurationMsFromBytes(bytes);
  } catch (error) {
    log.warn('Failed to probe AAC duration', { fileUri, error });
    return 0;
  }
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

/**
 * Best-effort removal of a user's recordings subtree.
 * Intentionally unwired from account switch / logout — #87 requires preserving
 * unsynced data for inactive accounts. Reserve for future explicit account
 * removal only.
 */
export function deleteUserTree(userId: string): void {
  try {
    const dir = new Directory(
      Paths.document,
      RECORDINGS_ROOT,
      `u${sanitizeSegment(userId, 'unknown')}`,
    );
    if (dir.exists) dir.delete();
  } catch (error) {
    log.warn('Failed to delete user recordings tree', { userId, error });
  }
}
