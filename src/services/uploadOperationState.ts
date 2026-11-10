/**
 * Durable activation-upload operation per (recording, upload intent version).
 *
 * An activating PUT is not idempotent across a lost acknowledgement: the
 * server may already have applied it, and another device may have selected
 * a newer take since. The operation pins the version precondition captured
 * when this intent generation first ran, so retries, restarts and scheduled
 * passes never pick up a newer server token on their own, and records
 * whether a PUT may have reached the server so the next attempt reconciles
 * (GET + content hash) before replaying.
 *
 * Stored in KV next to receipts and retry schedules, keyed by local
 * recording id. A new intent generation (selection, canonical, scope or file
 * change, or an explicit reselection) starts a new operation.
 */
import { kvStorage } from './storage';
import { logger } from '../utils/logger';
import { reassertRecordingActivation } from '../db/repository';

const log = logger.create('UploadOperationState');

export const UPLOAD_OPERATION_KEY_PREFIX = 'upload_op:';

/**
 * - `prepared`: precondition captured; no PUT for this generation can have
 *   reached the server.
 * - `dispatched`: a PUT may have been applied (sent, then the response was
 *   lost, aborted, timed out, 5xx or 409). Reconcile before any replay.
 * - `unresolved`: the take's bytes or the unit state show a different
 *   selection won; automatic passes must not replay. Needs a user decision.
 */
export type UploadOperationPhase = 'prepared' | 'dispatched' | 'unresolved';

export type UploadOperationState = {
  recordingId: string;
  intentVersion: number;
  /** `null`: no local token existed; the PUT is sent without a precondition. */
  baseVersionToken: number | null;
  phase: UploadOperationPhase;
  /** Server take holding this recording's bytes, when known. */
  serverTakeId?: number | null;
  /** Unit token observed while unresolved; only an explicit reselection adopts it. */
  observedVersionToken?: number | null;
  /** Replays sent after the unit's token moved past `baseVersionToken`. */
  movedReplays?: number;
  reason?: string;
  updatedAt: number;
};

export function uploadOperationKey(recordingId: string): string {
  return `${UPLOAD_OPERATION_KEY_PREFIX}${recordingId}`;
}

const PHASES: readonly UploadOperationPhase[] = [
  'prepared',
  'dispatched',
  'unresolved',
];

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function optionalId(value: unknown): number | null | undefined {
  if (value === null) return null;
  return isNonNegativeInteger(value) ? value : undefined;
}

function parseState(
  raw: string,
  recordingId: string,
): UploadOperationState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const r = parsed as Record<string, unknown>;
    if (r.recordingId !== recordingId) return null;
    if (!isNonNegativeInteger(r.intentVersion)) return null;
    if (
      r.baseVersionToken !== null &&
      !(
        typeof r.baseVersionToken === 'number' &&
        Number.isSafeInteger(r.baseVersionToken) &&
        r.baseVersionToken > 0
      )
    ) {
      return null;
    }
    if (!PHASES.includes(r.phase as UploadOperationPhase)) return null;
    const serverTakeId = optionalId(r.serverTakeId);
    const observedVersionToken = optionalId(r.observedVersionToken);
    return {
      recordingId,
      intentVersion: r.intentVersion,
      baseVersionToken: r.baseVersionToken as number | null,
      phase: r.phase as UploadOperationPhase,
      ...(serverTakeId !== undefined ? { serverTakeId } : {}),
      ...(observedVersionToken !== undefined ? { observedVersionToken } : {}),
      ...(isNonNegativeInteger(r.movedReplays)
        ? { movedReplays: r.movedReplays }
        : {}),
      ...(typeof r.reason === 'string' ? { reason: r.reason } : {}),
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Like `readUploadOperation`, but a KV read that throws is `'unreadable'`
 * rather than `null`: a stored (possibly dispatched) operation may exist, so
 * callers that would replace or clear it must not treat it as absent.
 */
export function readUploadOperationOrUnreadable(
  recordingId: string,
  intentVersion?: number,
): UploadOperationState | null | 'unreadable' {
  let raw: string | null;
  try {
    raw = kvStorage.getItemSync(uploadOperationKey(recordingId)) ?? null;
  } catch (error) {
    log.warn('Failed to read upload operation', { recordingId, error });
    return 'unreadable';
  }
  if (typeof raw !== 'string') return null;
  const state = parseState(raw, recordingId);
  if (!state) {
    log.warn('Dropping malformed upload operation', { recordingId });
    clearUploadOperation(recordingId);
    return null;
  }
  return intentVersion !== undefined && state.intentVersion !== intentVersion
    ? null
    : state;
}

/**
 * Operation for this generation, or `null` when none exists, it belongs to
 * another generation, or KV is unreadable / malformed.
 */
export function readUploadOperation(
  recordingId: string,
  intentVersion?: number,
): UploadOperationState | null {
  const state = readUploadOperationOrUnreadable(recordingId, intentVersion);
  return state === 'unreadable' ? null : state;
}

/** Never throws. `false` means the state will not survive a restart. */
export function writeUploadOperation(state: UploadOperationState): boolean {
  try {
    kvStorage.setItemSync(
      uploadOperationKey(state.recordingId),
      JSON.stringify(state),
    );
    return true;
  } catch (error) {
    log.error('Failed to persist upload operation', {
      recordingId: state.recordingId,
      error,
    });
    return false;
  }
}

/**
 * Explicit user decision to make a selected take whose upload failed (e.g.
 * an activation that ended unresolved) the server's active take. Starts a
 * new intent generation; an unresolved operation's observed unit token is
 * adopted here and nowhere else. The caller then queues an upload pass.
 */
export async function chooseLocalTakeAfterUnresolvedActivation(
  recordingId: string,
): Promise<boolean> {
  const operation = readUploadOperation(recordingId);
  const observed =
    operation?.phase === 'unresolved'
      ? operation.observedVersionToken ?? null
      : null;
  return reassertRecordingActivation(recordingId, observed);
}

/** Clear only when the stored operation belongs to `intentVersion` (if given). */
export function clearUploadOperation(
  recordingId: string,
  intentVersion?: number,
): void {
  if (intentVersion !== undefined) {
    const current = readUploadOperationOrUnreadable(recordingId);
    if (current === 'unreadable') return;
    if (current && current.intentVersion !== intentVersion) return;
  }
  try {
    kvStorage.removeItemSync(uploadOperationKey(recordingId));
  } catch (error) {
    log.warn('Failed to clear upload operation', { recordingId, error });
  }
}
