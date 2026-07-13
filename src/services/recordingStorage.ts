import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { logger } from '../utils/logger';
import { isAacRemuxAvailable, remuxAacToMp4 } from './aacRemux';

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
 * Repackages a merged ADTS AAC take into a seekable MP4 (`.m4a`) container for
 * review playback. Capture stays ADTS (kill-safe, byte-appendable), but raw
 * ADTS is not reliably seekable in ExoPlayer, so the committed take is remuxed
 * (lossless, no re-encode) via the native `AacRemux` module.
 *
 * Returns the new `.m4a` uri on success. Falls back to the input `.aac` uri
 * unchanged when the native remuxer is unavailable (e.g. a build that hasn't
 * been prebuilt) or the remux fails — playback still works from ADTS, it just
 * isn't seekable. The caller decides which uri to move into durable storage.
 */
export async function remuxTakeToSeekableContainer(
  aacUri: string,
): Promise<string> {
  if (!isAacRemuxAvailable()) {
    return aacUri;
  }

  const dest = new File(Paths.document, `remux-${randomUUID()}.m4a`);
  try {
    return await remuxAacToMp4(aacUri, dest.uri);
  } catch (error) {
    log.warn('Failed to remux take to MP4; falling back to ADTS', {
      aacUri,
      error,
    });
    try {
      if (dest.exists) dest.delete();
    } catch (cleanupError) {
      log.warn('Failed to delete partial remuxed file', {
        uri: dest.uri,
        error: cleanupError,
      });
    }
    return aacUri;
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

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function readUint64(bytes: Uint8Array, offset: number): number {
  return readUint32(bytes, offset) * 2 ** 32 + readUint32(bytes, offset + 4);
}

interface Mp4Box {
  /** First byte of the box payload (after its size + type header). */
  contentStart: number;
  /** One past the last byte of the box (exclusive). */
  contentEnd: number;
}

/**
 * Finds the first MP4 box of `type` directly within `[start, end)`. MP4 is a
 * flat list of size-prefixed boxes (`[uint32 size][4-char type][payload]`), so
 * this walks siblings without recursing; descend by calling it again over a
 * parent box's content range. `size === 1` selects a 64-bit `largesize`;
 * `size === 0` runs the box to `end`. Returns `null` on a malformed / truncated
 * chain (e.g. the moov-less file left by a process kill).
 */
function findMp4Box(
  bytes: Uint8Array,
  type: string,
  start: number,
  end: number,
): Mp4Box | null {
  let i = start;
  while (i + 8 <= end) {
    let size = readUint32(bytes, i);
    let headerSize = 8;
    if (size === 1) {
      if (i + 16 > end) break;
      size = readUint64(bytes, i + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - i;
    }
    if (size < headerSize || i + size > end) break;

    const boxType = String.fromCharCode(
      bytes[i + 4]!,
      bytes[i + 5]!,
      bytes[i + 6]!,
      bytes[i + 7]!,
    );
    if (boxType === type) {
      return { contentStart: i + headerSize, contentEnd: i + size };
    }
    i += size;
  }
  return null;
}

/** Unknown-duration sentinel MediaRecorder can leave in an mvhd. */
const MP4_UNKNOWN_DURATION = 0xffffffff;

function readMvhdDurationMs(
  bytes: Uint8Array,
  start: number,
  end: number,
): number {
  if (start + 4 > end) return 0;
  const version = bytes[start]!;

  // Layout after the 1-byte version + 3-byte flags: creation & modification
  // times, then timescale (uint32) and duration. Both times and the duration
  // widen from 32 to 64 bits in version 1.
  if (version === 1) {
    const timescaleOffset = start + 4 + 8 + 8;
    const durationOffset = timescaleOffset + 4;
    if (durationOffset + 8 > end) return 0;
    const timescale = readUint32(bytes, timescaleOffset);
    const duration = readUint64(bytes, durationOffset);
    if (timescale === 0) return 0;
    return Math.round((duration / timescale) * 1000);
  }

  const timescaleOffset = start + 4 + 4 + 4;
  const durationOffset = timescaleOffset + 4;
  if (durationOffset + 4 > end) return 0;
  const timescale = readUint32(bytes, timescaleOffset);
  const duration = readUint32(bytes, durationOffset);
  if (timescale === 0 || duration === MP4_UNKNOWN_DURATION) return 0;
  return Math.round((duration / timescale) * 1000);
}

/**
 * Computes the duration (ms) of an MP4/M4A container by reading `moov > mvhd`
 * (movie timescale + duration). Unlike ADTS, an MP4 has no per-frame framing:
 * its duration lives in the `moov` atom, which `MediaRecorder` only writes on a
 * clean `stop()`. A file killed mid-record therefore has no `moov` and yields
 * `0` here — the signal the manifest uses to drop an unplayable segment.
 */
export function mp4DurationMsFromBytes(bytes: Uint8Array): number {
  const moov = findMp4Box(bytes, 'moov', 0, bytes.length);
  if (!moov) return 0;
  const mvhd = findMp4Box(bytes, 'mvhd', moov.contentStart, moov.contentEnd);
  if (!mvhd) return 0;
  return readMvhdDurationMs(bytes, mvhd.contentStart, mvhd.contentEnd);
}

/**
 * Reads an MP4/M4A file and returns its duration (ms) via
 * {@link mp4DurationMsFromBytes}. Returns `0` on any read/parse failure (a
 * missing `moov`, i.e. a crash-truncated take, included).
 */
export async function mp4DurationMs(fileUri: string): Promise<number> {
  try {
    const bytes = await new File(fileUri).bytes();
    return mp4DurationMsFromBytes(bytes);
  } catch (error) {
    log.warn('Failed to probe MP4 duration', { fileUri, error });
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
 * DEBUG (#176): best-effort removal of the entire recordings tree (all users).
 * Wipes committed takes on disk; DB rows are cleared separately. Never throws.
 */
export function deleteAllRecordingFiles(): void {
  try {
    const dir = new Directory(Paths.document, RECORDINGS_ROOT);
    if (dir.exists) dir.delete();
  } catch (error) {
    log.warn('Failed to delete recordings root', { error });
  }
}

/** Best-effort removal of a user's entire recordings subtree (e.g. on logout). */
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
