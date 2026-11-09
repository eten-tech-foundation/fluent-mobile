/**
 * Download result validation (#886).
 *
 * `expo-file-system` resolves `downloadAsync` / `resumeAsync` for **any** HTTP
 * status and appends whatever body arrived to the destination file. Without
 * validation a 403 XML error page, an HTML captive-portal page, or a full 200
 * body appended onto a partial file (server ignored `Range`) was published as
 * a completed download. This module decides, from the response metadata and
 * the on-disk size, whether a transfer is complete, must be restarted from
 * scratch (which re-resolves the URL), or has failed.
 *
 * What is and is not observable with the legacy Expo API:
 * - status + response headers of the request that **finished** (200/206/…)
 * - the local file size before a resume (the offset Expo asks for) and after
 * - `md5` of the final file when `options.md5` is set
 * - NOT the headers of a transfer that was paused mid-way (`pauseAsync`
 *   returns none). Identity across a pause is covered by the resolver's
 *   take / contentHash check and SHA-256 for draft audio, and by
 *   Content-Range offset+total versus the local offset and expected final
 *   size for every item.
 */

export type DownloadResponseHeaders = Record<string, string | undefined>;

export type DownloadValidationInput = {
  /** HTTP status of the request that finished the transfer. */
  status: number | undefined;
  headers: DownloadResponseHeaders | undefined;
  /** True when this transfer was a `resumeAsync` (Range request). */
  resumed: boolean;
  /** Local file size (bytes) before the resume — the Range offset requested. */
  resumeOffset?: number;
  /**
   * Final size expected from the manifest / take metadata, when known (> 0).
   * Only pass a value that is an **exact** byte count (e.g. a draft take's
   * `sizeBytes`, computed server-side from the uploaded bytes). Upstream
   * catalogue sizes (Aquifer `file.size`) are advisory and must be omitted.
   */
  expectedTotalBytes?: number;
  /** Size of the destination file after the transfer. */
  fileSize: number | undefined;
  /** Hex md5 of the destination file (Expo `md5: true`), when available. */
  fileMd5?: string;
  /** Resource kind — used to reject obviously wrong bodies (HTML for audio). */
  kind?: 'text' | 'audio' | 'image';
};

export type DownloadValidationOutcome =
  | {
      ok: true;
      finalBytes: number | undefined;
    }
  | {
      ok: false;
      /**
       * - `restart`: the bytes on disk are untrustworthy (error body appended
       *   by Expo on 401/403, Range ignored, offset or total mismatch,
       *   size/md5 mismatch) — delete the file, re-resolve
       *   the URL and download from scratch. Bounded by the worker.
       * - `fail`: terminal for this attempt (no status, non-retryable HTTP
       *   status, destination missing) — no restart.
       */
      action: 'restart' | 'fail';
      reason: string;
    };

export type ParsedContentRange = {
  start: number;
  end: number;
  /** `undefined` when the server sent `*`. */
  total: number | undefined;
};

/** `bytes <start>-<end>/<total|*>` — anything else is unparseable. */
export function parseContentRange(
  value: string | undefined,
): ParsedContentRange | undefined {
  if (!value) return undefined;
  const match = /^\s*bytes\s+(\d+)-(\d+)\/(\d+|\*)\s*$/i.exec(value);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === '*' ? undefined : Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    return undefined;
  }
  if (end < start) return undefined;
  if (total !== undefined && (!Number.isSafeInteger(total) || end >= total)) {
    return undefined;
  }
  return { start, end, total };
}

function headerLookup(
  headers: DownloadResponseHeaders | undefined,
): (name: string) => string | undefined {
  if (!headers) return () => undefined;
  const lower = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') lower.set(key.toLowerCase(), value);
  }
  return (name: string) => lower.get(name.toLowerCase());
}

/** Weak-validator prefix (`W/`) and quotes stripped so S3/Azure forms compare. */
function normalizeEtag(value: string): string {
  return value.replace(/^W\//i, '').replace(/^"|"$/g, '');
}

const NON_AUDIO_BODY_TYPES =
  /^(text\/html|text\/xml|application\/xml|application\/json|text\/plain)\b/i;

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 → hex (no `atob` dependency in the RN/Jest runtimes). */
function base64ToHex(value: string): string | undefined {
  const clean = value.replace(/=+$/, '');
  if (clean.length === 0 || /[^A-Za-z0-9+/]/.test(clean)) return undefined;
  let bits = 0;
  let acc = 0;
  let hex = '';
  for (const ch of clean) {
    acc = (acc << 6) | BASE64_ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      hex += ((acc >> bits) & 0xff).toString(16).padStart(2, '0');
    }
  }
  return hex;
}

/**
 * Server-side MD5 when the response exposes one: `Content-MD5` (base64) or an
 * S3-style single-part ETag (32 hex chars). Multipart ETags (`…-N`) and opaque
 * Azure ETags are not digests and are ignored.
 */
export function serverMd5Hex(
  headers: DownloadResponseHeaders | undefined,
): string | undefined {
  const get = headerLookup(headers);
  const contentMd5 = get('content-md5');
  if (contentMd5) {
    const hex = base64ToHex(contentMd5.trim());
    if (hex && hex.length === 32) return hex;
  }
  // SSE-KMS / SSE-C objects carry a 32-hex ETag that is *not* the MD5 of the
  // plaintext; only SSE-S3 / unencrypted single-part ETags are digests.
  const sse = get('x-amz-server-side-encryption');
  if (
    (sse && /^aws:kms/i.test(sse)) ||
    get('x-amz-server-side-encryption-customer-algorithm')
  ) {
    return undefined;
  }
  const etag = get('etag');
  if (etag) {
    const bare = normalizeEtag(etag);
    if (/^[0-9a-f]{32}$/i.test(bare)) return bare.toLowerCase();
  }
  return undefined;
}

function parseContentLength(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

export function validateDownloadResult(
  input: DownloadValidationInput,
): DownloadValidationOutcome {
  const { status, headers, resumed, fileSize } = input;
  const get = headerLookup(headers);
  const expectedTotal =
    typeof input.expectedTotalBytes === 'number' && input.expectedTotalBytes > 0
      ? input.expectedTotalBytes
      : undefined;

  if (typeof status !== 'number') {
    return { ok: false, action: 'fail', reason: 'no HTTP status on result' };
  }
  if (status === 401 || status === 403) {
    // Signed URLs (15-min SAS / presigned) expire mid-queue. Expo has already
    // appended the XML/JSON error body to the file, so the partial bytes are
    // no longer clean: restart (which re-resolves a fresh URL).
    return {
      ok: false,
      action: 'restart',
      reason: `expired or unauthorised URL (HTTP ${status})`,
    };
  }
  if (status === 416) {
    if (
      resumed &&
      expectedTotal !== undefined &&
      input.resumeOffset === expectedTotal &&
      fileSize === expectedTotal
    ) {
      // The file was already complete when we asked to resume past its end.
      return { ok: true, finalBytes: expectedTotal };
    }
    // Range not satisfiable: our offset no longer matches the object.
    return { ok: false, action: 'restart', reason: 'HTTP 416' };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, action: 'fail', reason: `HTTP ${status}` };
  }

  const contentType = get('content-type');
  if (
    input.kind === 'audio' &&
    contentType &&
    NON_AUDIO_BODY_TYPES.test(contentType)
  ) {
    return {
      ok: false,
      action: 'restart',
      reason: `non-audio body (${contentType.split(';')[0]})`,
    };
  }

  let finalBytes: number | undefined;

  if (resumed) {
    if (status !== 206) {
      // Server ignored Range and sent the whole body; Expo appended it to
      // the partial file, so the file is now corrupt.
      return {
        ok: false,
        action: 'restart',
        reason: `range ignored (HTTP ${status} on resume)`,
      };
    }
    const range = parseContentRange(get('content-range'));
    if (!range) {
      return {
        ok: false,
        action: 'restart',
        reason: 'missing or malformed Content-Range on 206',
      };
    }
    if (
      typeof input.resumeOffset === 'number' &&
      range.start !== input.resumeOffset
    ) {
      return {
        ok: false,
        action: 'restart',
        reason: `Content-Range start ${range.start} != resume offset ${input.resumeOffset}`,
      };
    }
    if (range.total === undefined) {
      return {
        ok: false,
        action: 'restart',
        reason: 'Content-Range without total; cannot verify final size',
      };
    }
    if (range.end + 1 !== range.total) {
      return {
        ok: false,
        action: 'restart',
        reason: `partial response ends at ${range.end}, total ${range.total}`,
      };
    }
    if (expectedTotal !== undefined && range.total !== expectedTotal) {
      return {
        ok: false,
        action: 'restart',
        reason: `Content-Range total ${range.total} != expected ${expectedTotal}`,
      };
    }
    // NOTE: the 206's Content-Length is only the tail; the final size is the
    // Content-Range total.
    finalBytes = range.total;
  } else {
    if (status === 206) {
      return {
        ok: false,
        action: 'restart',
        reason: 'unexpected 206 on a fresh download',
      };
    }
    const contentLength = parseContentLength(get('content-length'));
    if (
      expectedTotal !== undefined &&
      contentLength !== undefined &&
      contentLength !== expectedTotal
    ) {
      return {
        ok: false,
        action: 'restart',
        reason: `Content-Length ${contentLength} != expected ${expectedTotal}`,
      };
    }
    finalBytes = contentLength ?? expectedTotal;
  }

  if (typeof fileSize !== 'number') {
    return { ok: false, action: 'fail', reason: 'destination file missing' };
  }
  if (fileSize === 0) {
    return { ok: false, action: 'restart', reason: 'destination file empty' };
  }
  if (finalBytes !== undefined && fileSize !== finalBytes) {
    return {
      ok: false,
      action: 'restart',
      reason: `file size ${fileSize} != expected ${finalBytes}`,
    };
  }

  const serverMd5 = serverMd5Hex(headers);
  if (serverMd5 && input.fileMd5) {
    if (serverMd5 !== input.fileMd5.toLowerCase()) {
      return { ok: false, action: 'restart', reason: 'md5 mismatch' };
    }
  }

  return { ok: true, finalBytes: finalBytes ?? fileSize };
}
