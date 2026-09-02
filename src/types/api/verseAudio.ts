/**
 * Frozen client contract for verse audio upload/playback.
 *
 * Source of truth consulted:
 * - fluent-api PR [#281](https://github.com/eten-tech-foundation/fluent-api/pull/281)
 *   (`fluent-api#271` — verse audio conflict detection)
 * - Prior baseline: fluent-api #224 (`PUT/GET/DELETE /verse-audio/...`)
 *
 * Draft [fluent-api #188](https://github.com/eten-tech-foundation/fluent-api/pull/188)
 * (`POST /recordings/sync` + Cloudflare R2) is **not** on main and conflicts with #224.
 * See docs/guides/recordings-sync-contract.md.
 */

/** React Native `FormData` file part (uri-based; not a web Blob). */
export interface VerseAudioFilePart {
  uri: string;
  name: string;
  type: string;
}

/**
 * Upload params for `PUT /verse-audio/{projectUnitId}/{bibleTextId}`.
 * IDs are path params only — never send user id in the multipart body.
 */
export interface UploadVerseAudioParams {
  projectUnitId: number;
  bibleTextId: number;
  /**
   * Audio bytes. Callers may pass RN `{ uri, name, type }`; the upload path
   * reads the file and appends a Blob (Expo fetch rejects uri FormData parts).
   */
  file: Blob | VerseAudioFilePart;
  /** Optional client-measured duration (seconds); form field `durationSeconds`. */
  durationSeconds?: number;
  /**
   * Last-known unit versionToken (starts at 1). Omit for a first take on a
   * unit or a legacy client. See fluent-api#271 / PR #281.
   */
  baseVersionToken?: number;
}

export type VerseAudioConflictStatus = 'clean' | 'conflict';

export interface VerseAudioTakeResponse {
  id: number;
  uploadedBy: number;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  contentHash: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** Successful `200` body (`verseAudioResponseSchema` in fluent-api #271). */
export interface VerseAudioResponse {
  id: number;
  projectUnitId: number;
  bibleTextId: number;
  uploadedBy: number;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  versionToken: number;
  conflictStatus: VerseAudioConflictStatus;
  activeTakeId: number | null;
  verseNumber: number;
  downloadUrl: string;
  takes: VerseAudioTakeResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface VerseAudioListResponse {
  items: VerseAudioResponse[];
  hasConflict: boolean;
}

/** `503` when `AZURE_STORAGE_CONNECTION_STRING` is unset (fluent-api #224). */
export interface VerseAudioStorageUnavailableBody {
  error: string;
  details: string;
}

export interface VerseAudioErrorBody {
  message: string;
}

/**
 * Deterministic Azure blob name used by fluent-api `audioBlobName()`.
 * Persist this string into local `recordings.blob_key` after a successful upload.
 */
export function verseAudioBlobKey(
  projectUnitId: number,
  bibleTextId: number,
): string {
  return `unit-${projectUnitId}/text-${bibleTextId}`;
}

/** MIME types accepted by fluent-api #224 (`ALLOWED_AUDIO_CONTENT_TYPES`). */
export const VERSE_AUDIO_ALLOWED_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
  'audio/wav',
  'audio/ogg',
] as const;

export const VERSE_AUDIO_MAX_BYTES = 30 * 1024 * 1024;
