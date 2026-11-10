/**
 * Durable upload receipts (#886).
 *
 * The server accepting a take and the client *recording* that acceptance are
 * two different steps. When the PUT returns 2xx but the SQLite marker write
 * (`markRecordingUploaded` / `markRecordingAndChapterConflicted`) fails, the
 * recording row stays pending and the next pass would replay the PUT.
 *
 * A receipt is written to the KV store (separate MMKV-style storage, not the
 * SQLite database that just failed) synchronously **before** the marker is
 * attempted, so the three outcomes are distinguishable:
 *
 * 1. Receipt persisted, marker failed → reconcile locally from the receipt
 *    on the next pass; no PUT.
 * 2. HTTP acknowledgement lost (timeout / transport error after the server
 *    processed the request) → no response, so no receipt is possible. The
 *    next pass reads the unit back (GET + SHA-256 of the active take) before
 *    any re-PUT; see `docs/guides/recordings-sync-contract.md`. This is not
 *    exactly-once: that needs server operation idempotency.
 * 3. Receipt write itself failed → treated as case 2; logged and counted.
 *
 * Receipts bind to the accepted operation version. A later selection or
 * canonical designation must keep its own pending marker.
 */
import type { AcceptedRecordingScope } from '../types/db/types';
import { kvStorage } from './storage';
import { logger } from '../utils/logger';

const log = logger.create('UploadReceipts');

export const UPLOAD_RECEIPT_KEY_PREFIX = 'upload_receipt:';
/**
 * Receipts that cannot be applied (malformed, or written before operation
 * versions existed) are moved here rather than deleted, so the server take
 * id stays available to deletion recovery and support.
 */
export const UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX = 'upload_receipt_unbound:';

type UploadReceiptBase = {
  recordingId: string;
  /** Operation generation the server accepted; markers apply only to it. */
  uploadIntentVersion: number;
  acceptedScope: AcceptedRecordingScope;
  bibleTextId: number;
  versionToken: number;
  serverTakeId: number | null;
  acceptedAt: string;
};

/** `kind` mirrors the marker that still has to be written locally. */
export type UploadReceipt =
  | (UploadReceiptBase & { kind: 'uploaded'; blobKey: string })
  | (UploadReceiptBase & { kind: 'conflicted'; blobKey?: undefined });

export function uploadReceiptKey(recordingId: string): string {
  return `${UPLOAD_RECEIPT_KEY_PREFIX}${recordingId}`;
}

function unboundUploadReceiptKey(recordingId: string): string {
  return `${UNBOUND_UPLOAD_RECEIPT_KEY_PREFIX}${recordingId}`;
}

/**
 * Persist a receipt. Returns `false` (never throws) when the KV write fails so
 * the caller can fall back to the replay contract and count the miss.
 */
export function persistUploadReceipt(receipt: UploadReceipt): boolean {
  try {
    kvStorage.setItemSync(
      uploadReceiptKey(receipt.recordingId),
      JSON.stringify(receipt),
    );
    return true;
  } catch (error) {
    log.error('Failed to persist upload receipt', {
      recordingId: receipt.recordingId,
      error,
    });
    return false;
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseScope(value: unknown): AcceptedRecordingScope | null {
  if (!value || typeof value !== 'object') return null;
  const scope = value as Record<string, unknown>;
  if (
    !isFiniteNumber(scope.bibleTextId) ||
    !(scope.projectUnitId === null || isFiniteNumber(scope.projectUnitId)) ||
    typeof scope.localFilePath !== 'string' ||
    !(scope.recordedByUserId === null || isFiniteNumber(scope.recordedByUserId))
  ) {
    return null;
  }
  return {
    bibleTextId: scope.bibleTextId,
    projectUnitId: scope.projectUnitId,
    localFilePath: scope.localFilePath,
    recordedByUserId: scope.recordedByUserId,
  };
}

/** Only a receipt bound to an operation generation and scope can be applied. */
function parseReceipt(raw: string, recordingId: string): UploadReceipt | null {
  const r = parseJsonObject(raw);
  if (!r || r.recordingId !== recordingId) return null;
  if (!isFiniteNumber(r.bibleTextId) || !isFiniteNumber(r.versionToken)) {
    return null;
  }
  const uploadIntentVersion = r.uploadIntentVersion;
  if (
    typeof uploadIntentVersion !== 'number' ||
    !Number.isSafeInteger(uploadIntentVersion) ||
    uploadIntentVersion < 0
  ) {
    return null;
  }
  const acceptedScope = parseScope(r.acceptedScope);
  if (!acceptedScope || acceptedScope.bibleTextId !== r.bibleTextId)
    return null;
  if (
    !positiveInteger(r.versionToken) ||
    typeof r.acceptedAt !== 'string' ||
    r.acceptedAt.length === 0
  ) {
    return null;
  }
  const serverTakeIdAbsent =
    r.serverTakeId === null || r.serverTakeId === undefined;
  const serverTakeId = serverTakeIdAbsent
    ? null
    : positiveInteger(r.serverTakeId);
  if (!serverTakeIdAbsent && serverTakeId === null) return null;
  const base = {
    recordingId,
    uploadIntentVersion,
    acceptedScope,
    bibleTextId: r.bibleTextId,
    versionToken: r.versionToken,
    serverTakeId,
    acceptedAt: r.acceptedAt,
  };
  if (r.kind === 'uploaded') {
    return typeof r.blobKey === 'string' && r.blobKey.length > 0
      ? { ...base, kind: 'uploaded', blobKey: r.blobKey }
      : null;
  }
  if (r.kind === 'conflicted') return { ...base, kind: 'conflicted' };
  return null;
}

/**
 * Read an applicable receipt. Anything else is moved to the unbound key and
 * reported null, so the next pass falls back to reading the unit back from
 * the server before any re-PUT.
 */
export function readUploadReceipt(recordingId: string): UploadReceipt | null {
  let raw: string | null;
  try {
    raw = kvStorage.getItemSync(uploadReceiptKey(recordingId)) ?? null;
  } catch (error) {
    log.warn('Failed to read upload receipt', { recordingId, error });
    return null;
  }
  if (typeof raw !== 'string') return null;
  const receipt = parseReceipt(raw, recordingId);
  if (!receipt) {
    log.warn('Upload receipt cannot be applied; keeping it unbound', {
      recordingId,
    });
    retainRawUnbound(recordingId, raw);
  }
  return receipt;
}

/**
 * Server take id recorded by any receipt for this recording, applicable or
 * not. Lets a local delete queue the server copy for removal.
 */
export function readUploadReceiptServerTakeId(
  recordingId: string,
): number | null {
  const applicable = readUploadReceipt(recordingId);
  if (applicable) return positiveInteger(applicable.serverTakeId);
  let raw: string | null;
  try {
    raw = kvStorage.getItemSync(unboundUploadReceiptKey(recordingId)) ?? null;
  } catch {
    return null;
  }
  const unbound = typeof raw === 'string' ? parseJsonObject(raw) : null;
  if (!unbound || unbound.recordingId !== recordingId) return null;
  return positiveInteger(unbound.serverTakeId);
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

/**
 * Keep `raw` for deletion recovery. An unbound entry that already names a
 * server take is left in place so a later malformed write cannot erase it.
 */
function retainRawUnbound(recordingId: string, raw: string): void {
  try {
    const existing = kvStorage.getItemSync(
      unboundUploadReceiptKey(recordingId),
    );
    if (typeof existing === 'string') {
      const parsed = parseJsonObject(existing);
      if (parsed && positiveInteger(parsed.serverTakeId)) return;
    }
    kvStorage.setItemSync(unboundUploadReceiptKey(recordingId), raw);
    kvStorage.removeItemSync(uploadReceiptKey(recordingId));
  } catch (error) {
    log.warn('Failed to move unbound upload receipt', { recordingId, error });
  }
}

/** Stop applying this receipt without discarding its server take id. */
export function retainUploadReceiptUnbound(recordingId: string): void {
  let raw: string | null;
  try {
    raw = kvStorage.getItemSync(uploadReceiptKey(recordingId)) ?? null;
  } catch (error) {
    log.warn('Failed to read upload receipt', { recordingId, error });
    return;
  }
  if (typeof raw !== 'string') return;
  retainRawUnbound(recordingId, raw);
}

export function clearUploadReceipt(recordingId: string): void {
  try {
    kvStorage.removeItemSync(uploadReceiptKey(recordingId));
  } catch (error) {
    log.warn('Failed to clear upload receipt', { recordingId, error });
  }
}

/** Drop applicable and unbound receipts once the recording no longer exists. */
export function clearAllUploadReceipts(recordingId: string): void {
  clearUploadReceipt(recordingId);
  try {
    kvStorage.removeItemSync(unboundUploadReceiptKey(recordingId));
  } catch (error) {
    log.warn('Failed to clear unbound upload receipt', { recordingId, error });
  }
}
