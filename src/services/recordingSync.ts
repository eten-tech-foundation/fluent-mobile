import * as FileSystem from 'expo-file-system/legacy';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import type { PendingUploadChapter } from '../db/queries';
import {
  clearRecordingDeletion,
  getPendingRecordingDeletions,
  getPendingRecordings,
  getLatestVersionToken,
  markRecordingAndChapterConflicted,
  markRecordingFailed,
  markRecordingUploaded,
  raiseVerseVersionToken,
  setRecordingSyncStatus,
  updateRecordingVersionToken,
} from '../db/repository';
import {
  getRecordingOwnerIds,
  reconcileHeldRecordings,
} from '../db/repositories/heldRecordingsRepository';
import {
  getVerifiedMembershipOwners,
  refreshMembershipForOwners,
} from './projectMembership';
import type {
  PendingRecording,
  PendingRecordingDeletion,
} from '../types/db/types';
import { logger } from '../utils/logger';
import {
  isNetworkTransportError,
  UploadNetworkInterruptedError,
} from '../utils/networkError';
import { hasUsableRecordingRange } from '../utils/recordingRange';
import { isApiError } from '../types/api/errors';
import { FluentAPI } from './api';
import { isAuthError } from './authError';
import { authToken } from './authToken';
import { getCredentials, getCredentialsVersion } from './keychain';
import { getActiveUserId, setReauthRequired } from './storage';
import {
  clearUploadReceipt,
  persistUploadReceipt,
  readUploadReceipt,
  retainUploadReceiptUnbound,
} from './uploadReceipts';
import {
  activationStateFromResponse,
  blobKeyFromVerseAudioResponse,
  isPossiblyAppliedUploadFailure,
  outcomeFromVerseAudioFailure,
  takeIdFromVerseAudioResponse,
} from './verseAudioContract';
import type { VerseAudioResponse } from '../types/api/verseAudio';
import { isSha256Hex, sha256File } from './fileSha256';
import {
  clearUploadOperation,
  readUploadOperationOrUnreadable,
  writeUploadOperation,
  type UploadOperationState,
} from './uploadOperationState';
import {
  emitAuthReauthRequired,
  emitHeldRecordingsChanged,
  emitUploadSessionEvent,
  type UploadSessionEvent,
} from './syncEvents';
import {
  setChapterUploadWorker,
  type ChapterUploadWorker,
  type TakeProgressListener,
} from './uploadOrchestrator';

const log = logger.create('RecordingSync');

export const MAX_UPLOAD_ATTEMPTS = 3;

export interface UploadResult {
  uploaded: number;
  conflicted: number;
  /** Takes still pending after a terminal (non-network, non-auth) failure. */
  failed: number;
  /**
   * Takes whose local intent changed while this pass held them (a newer
   * selection or re-record). Not failures: the row stays pending under its
   * new generation, so the pass is not complete while any remain.
   */
  deferred: number;
  /**
   * Queued take deletes still pending after a terminal failure (#886).
   * Callers must treat this like `failed`: the pass is not complete.
   */
  deletionsFailed: number;
}

/** Terminal outcome of one queued take delete (#886). */
export type TakeDeletionOutcome =
  | { kind: 'deleted'; versionToken: number | null }
  | { kind: 'already_absent' }
  | { kind: 'failed'; message: string };

export type DeletePassResult = {
  attempted: number;
  deleted: number;
  /** Rows left queued after a terminal failure, all owners. */
  failed: number;
  /**
   * Subset of `failed` the active account is shown as pending (same owner
   * rule as `getPendingUploadCount`). Only these fail an upload session; a
   * stuck row from another account or an orphaned remap stays queued and is
   * logged, instead of blocking the active user's `complete` forever.
   */
  failedForActiveUser: number;
};

export type RecordingSyncOptions = {
  signal?: AbortSignal;
  /** When set, only upload latest pending recordings for this chapter. */
  chapter?: PendingUploadChapter;
  /** Injectable backoff (tests). Default: attempt * 500ms. */
  delay?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  /**
   * Called once before the first take (0 of N) and after every take with the
   * pass totals so far (#886). Chapter-scoped passes use it to report
   * per-take progress to the orchestrator without owning session events.
   */
  onTakeProgress?: TakeProgressListener;
  /** Injectable clock for upload operation timestamps (tests). */
  now?: () => number;
};

let inFlight: Promise<UploadResult> | null = null;

function defaultDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createAbortError(): Error {
  const error = new Error('Upload aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function awaitWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        cleanup();
        resolve(value);
      },
      error => {
        cleanup();
        reject(error);
      },
    );
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  const name = parts[parts.length - 1];
  return name && name.length > 0 ? name : 'recording.m4a';
}

function contentTypeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mp4';
}

async function assertLocalFileExists(localFilePath: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(localFilePath);
  if (!info.exists || info.isDirectory) {
    throw Object.assign(new Error(`Recording file missing: ${localFilePath}`), {
      terminal: true,
    });
  }
}

async function handleUploadAuthFailure(userId: string): Promise<void> {
  setReauthRequired(userId);
  if (userId === getActiveUserId()) {
    emitAuthReauthRequired(userId);
  }
}

export type UploadTokenResolution = {
  token: string;
  userId: string | null;
  /** `fallback`: the pass token, used when owner credentials are missing. */
  source: 'owner' | 'fallback';
};

/**
 * Prefer the capture-time owner's stored token so upload attribution stays
 * stable even if another account is active (#105). Falls back to the pass token.
 */
export async function resolveOwnerAuthToken(
  recordedByUserId: number | null,
  fallbackToken: string,
  context: { id: string; kind?: 'take' | 'delete' },
): Promise<UploadTokenResolution> {
  if (recordedByUserId === null || !Number.isFinite(recordedByUserId)) {
    return {
      token: fallbackToken,
      userId: getActiveUserId() || null,
      source: 'fallback',
    };
  }
  const userId = String(recordedByUserId);
  const creds = await getCredentials(userId);
  if (creds?.token) {
    return { token: creds.token, userId, source: 'owner' };
  }
  // Falls back to the active pass token when owner credentials are missing (#854).
  log.warn('Owner credentials missing; using active pass token', {
    id: context.id,
    kind: context.kind,
    recordedByUserId,
  });
  return {
    token: fallbackToken,
    userId: getActiveUserId() || null,
    source: 'fallback',
  };
}

export async function resolveUploadTokenForRecording(
  recording: PendingRecording,
  fallbackToken: string,
): Promise<UploadTokenResolution> {
  return resolveOwnerAuthToken(recording.recordedByUserId, fallbackToken, {
    id: recording.id,
    kind: 'take',
  });
}

/**
 * Owner tokens for one upload pass. A token is reused only while the keychain
 * is unchanged (login, logout, account replacement). Owner-missing fallbacks
 * are never cached, and `clear()` after any take that did not finish makes
 * the next take re-read SecureStore (auth failures, reauth).
 */
function createPassOwnerTokens() {
  const tokens = new Map<
    string,
    { resolution: UploadTokenResolution; version: number }
  >();
  return {
    async resolve(
      recording: PendingRecording,
      fallbackToken: string,
    ): Promise<UploadTokenResolution> {
      const owner = recording.recordedByUserId;
      const key =
        owner !== null && Number.isFinite(owner) ? String(owner) : null;
      const cached = key === null ? undefined : tokens.get(key);
      if (cached && cached.version === getCredentialsVersion()) {
        return cached.resolution;
      }
      const version = getCredentialsVersion();
      const resolution = await resolveUploadTokenForRecording(
        recording,
        fallbackToken,
      );
      if (key !== null && resolution.source === 'owner') {
        tokens.set(key, { resolution, version });
      }
      return resolution;
    },
    clear(): void {
      tokens.clear();
    },
  };
}

/**
 * Canonical and selected takes become the server's active take; other takes
 * upload as stored-only alternates (#716).
 */
function shouldActivateTake(recording: PendingRecording): boolean {
  return recording.isCanonical || recording.isSelected;
}

export const ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE =
  'Another take is active on the server. This recording is saved on this device; choose it again to make it active.';
export const ACTIVATION_UNIT_EXISTS_MESSAGE =
  'This verse already has audio on the server. This recording is saved on this device; choose it again to replace it.';
export const ACTIVATION_UNIT_REMOVED_MESSAGE =
  "This verse's audio was removed on the server. This recording is saved on this device; choose it again to upload it.";

type ActivationReconciliation =
  | { kind: 'confirmed'; unit: VerseAudioResponse; takeId: number }
  | { kind: 'replay'; versionMoved: boolean }
  | {
      kind: 'unresolved';
      reason: string;
      serverTakeId: number | null;
      observedVersionToken: number | null;
    };

/**
 * After an activating PUT may have been applied (lost ack, timeout, 5xx,
 * 409), read the unit and find this recording's take by content hash before
 * deciding whether a replay is safe. Never adopts a newer server token:
 * a replay always carries the operation's original precondition.
 */
async function reconcileActivation(
  recording: PendingRecording,
  operation: UploadOperationState,
  token: string,
  signal?: AbortSignal,
): Promise<ActivationReconciliation> {
  const projectUnitId = recording.projectUnitId as number;
  let unit: VerseAudioResponse | null;
  try {
    unit = await FluentAPI.getVerseAudioUnit(
      { projectUnitId, bibleTextId: recording.bibleTextId },
      token,
      signal ? { signal } : undefined,
    );
  } catch (error) {
    if (!isApiError(error) || error.status !== 404) throw error;
    unit = null;
  }
  throwIfAborted(signal);

  if (!unit) {
    // Nothing exists: a replay is the original first-take create. A unit that
    // existed when the precondition was captured but is gone now was removed
    // by someone else; re-creating it is a user decision.
    return operation.baseVersionToken === null
      ? { kind: 'replay', versionMoved: false }
      : {
          kind: 'unresolved',
          reason: ACTIVATION_UNIT_REMOVED_MESSAGE,
          serverTakeId: null,
          observedVersionToken: null,
        };
  }

  const localHash = (
    await sha256File(recording.localFilePath, { signal })
  ).toLowerCase();
  throwIfAborted(signal);
  const match = unit.takes.find(
    take =>
      isSha256Hex(take.contentHash) &&
      take.contentHash.toLowerCase() === localHash,
  );

  if (match) {
    if (unit.activeTakeId === match.id) {
      return { kind: 'confirmed', unit, takeId: match.id };
    }
    // Bytes stored, not active, and nothing has moved since the
    // precondition: the replay promotes this take or conflicts.
    if (
      operation.baseVersionToken !== null &&
      unit.versionToken === operation.baseVersionToken
    ) {
      return { kind: 'replay', versionMoved: false };
    }
    return {
      kind: 'unresolved',
      reason: ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
      serverTakeId: match.id,
      observedVersionToken: unit.versionToken,
    };
  }

  // Bytes absent. With a precondition the server keeps a newer selection and
  // flags a conflict instead of overwriting it. Without one (no local token
  // was known), the API would replace whatever is active: not automatic.
  if (operation.baseVersionToken === null) {
    return {
      kind: 'unresolved',
      reason: ACTIVATION_UNIT_EXISTS_MESSAGE,
      serverTakeId: null,
      observedVersionToken: unit.versionToken,
    };
  }
  // fluent-api main answers a stale precondition with a conflict 200, so one
  // replay surfaces the conflict. If the unit moved and that replay still did
  // not land (e.g. repeated 409s), stop rather than cycle.
  const versionMoved = unit.versionToken !== operation.baseVersionToken;
  if (versionMoved && (operation.movedReplays ?? 0) >= 1) {
    return {
      kind: 'unresolved',
      reason: ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
      serverTakeId: null,
      observedVersionToken: unit.versionToken,
    };
  }
  return { kind: 'replay', versionMoved };
}
/**
 * Apply a durable receipt (#886) to a recording that is still pending: the
 * server already accepted these bytes, only the local marker is missing.
 * Returns `null` when there is no receipt. With a receipt the PUT is never
 * replayed: the marker either lands (`uploaded` / `conflicted`) or fails again
 * (`failed`, receipt kept, row stays pending).
 */
async function reconcileFromUploadReceipt(
  recording: PendingRecording,
): Promise<'uploaded' | 'conflicted' | 'failed' | 'deferred' | null> {
  const receipt = readUploadReceipt(recording.id);
  if (!receipt) return null;
  if (receipt.bibleTextId !== recording.bibleTextId) {
    log.warn('Keeping superseded receipt unbound for a different verse', {
      recordingId: recording.id,
    });
    retainUploadReceiptUnbound(recording.id);
    return null;
  }
  const intentVersion = recording.uploadIntentVersion ?? 0;
  const matchesIntent = receipt.uploadIntentVersion === intentVersion;
  let applied: boolean | void;
  try {
    if (receipt.kind === 'conflicted') {
      applied = await markRecordingAndChapterConflicted(
        recording.id,
        receipt.bibleTextId,
        receipt.versionToken,
        receipt.serverTakeId,
        receipt.uploadIntentVersion,
        receipt.acceptedScope,
      );
    } else {
      applied = await markRecordingUploaded(
        recording.id,
        receipt.blobKey,
        receipt.versionToken,
        receipt.serverTakeId,
        receipt.uploadIntentVersion,
        receipt.acceptedScope,
      );
    }
  } catch (error) {
    log.error('Upload receipt reconciliation failed; keeping receipt', {
      recordingId: recording.id,
      kind: receipt.kind,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'failed';
  }
  // `false` means this generation does not own the sync marker. The scope
  // fallback already copied the server take id onto the row when it could.
  // Move the receipt off the live key so later passes do not re-apply it.
  if (applied === false) {
    retainUploadReceiptUnbound(recording.id);
    // The pending row we are holding is a newer generation: upload that.
    // If we thought this generation was current, the row changed under us;
    // wait for the next read instead of PUTting a stale snapshot.
    return matchesIntent ? 'deferred' : null;
  }
  clearUploadReceipt(recording.id);
  if (!matchesIntent) {
    // Reconcile accepted bytes only, then send the current operation rather
    // than consuming its newer selection/canonical intent.
    return null;
  }
  log.info('Recording marker reconciled from durable receipt (no re-upload)', {
    recordingId: recording.id,
    kind: receipt.kind,
    versionToken: receipt.versionToken,
    serverTakeId: receipt.serverTakeId,
  });
  return receipt.kind;
}

async function uploadOneRecording(
  recording: PendingRecording,
  options: {
    signal?: AbortSignal;
    delay: (ms: number) => Promise<void>;
    maxAttempts: number;
    /** Token for this recording (owner preferred). */
    token: string;
    /** User id that owns the upload token (for auth failure handling). */
    tokenUserId: string | null;
    now: () => number;
  },
): Promise<TakeUploadOutcome> {
  const { signal, delay, maxAttempts, token, tokenUserId } = options;

  throwIfAborted(signal);

  // Server already accepted these bytes on an earlier pass and only the local
  // marker failed: finish locally instead of replaying the PUT (#886).
  const reconciled = await reconcileFromUploadReceipt(recording);
  if (reconciled) {
    // Same post-marker abort check as the normal path.
    throwIfAborted(signal);
    if (reconciled !== 'deferred' && reconciled !== 'failed') {
      clearUploadOperation(recording.id, recording.uploadIntentVersion ?? 0);
    }
    return reconciled;
  }

  if (
    recording.projectUnitId === null ||
    !Number.isFinite(recording.projectUnitId)
  ) {
    const message =
      'Missing projectUnitId for recording (no matching chapter assignment)';
    log.error(message, { recordingId: recording.id });
    if (
      (await markRecordingFailed(
        recording.id,
        message,
        recording.uploadIntentVersion ?? 0,
      )) === false
    )
      return 'deferred';
    return 'failed';
  }

  if (!Number.isFinite(recording.bibleTextId) || recording.bibleTextId <= 0) {
    const message = 'Missing or invalid bibleTextId for recording';
    log.error(message, { recordingId: recording.id });
    if (
      (await markRecordingFailed(
        recording.id,
        message,
        recording.uploadIntentVersion ?? 0,
      )) === false
    )
      return 'deferred';
    return 'failed';
  }

  const isPericope = recording.granularity === 'pericope';
  let pericopeRange:
    | {
        startChapter: number;
        startVerse: number;
        endChapter: number;
        endVerse: number;
      }
    | undefined;
  if (isPericope) {
    const startChapter = recording.startChapter ?? 0;
    const startVerse = recording.startVerse ?? 0;
    const endChapter = recording.endChapter ?? 0;
    const endVerse = recording.endVerse ?? 0;
    if (
      !hasUsableRecordingRange({
        startChapter,
        startVerse,
        endChapter,
        endVerse,
      }) ||
      endChapter <= 0 ||
      endVerse <= 0
    ) {
      const message =
        'Missing or invalid pericope range for recording (start/end chapter and verse required)';
      log.error(message, {
        recordingId: recording.id,
        startChapter: recording.startChapter,
        startVerse: recording.startVerse,
        endChapter: recording.endChapter,
        endVerse: recording.endVerse,
      });
      if (
        (await markRecordingFailed(
          recording.id,
          message,
          recording.uploadIntentVersion ?? 0,
        )) === false
      )
        return 'deferred';
      return 'failed';
    }
    pericopeRange = { startChapter, startVerse, endChapter, endVerse };
  }

  if (
    (await setRecordingSyncStatus(
      recording.id,
      'uploading',
      recording.uploadIntentVersion ?? 0,
    )) === false
  )
    return 'deferred';

  const intentVersion = recording.uploadIntentVersion ?? 0;
  const activate = shouldActivateTake(recording);
  const projectUnitId = recording.projectUnitId;

  // Activation precondition is captured once per intent generation and kept
  // across attempts, restarts and scheduled passes (see uploadOperationState).
  let operation: UploadOperationState | null = null;
  if (activate) {
    const stored = readUploadOperationOrUnreadable(recording.id, intentVersion);
    if (stored === 'unreadable') {
      // A dispatched operation may be stored; replacing it would replay the
      // activation blind under a newer token. Leave it for a later pass.
      const message = 'Could not read upload state on this device';
      if (
        (await markRecordingFailed(recording.id, message, intentVersion)) ===
        false
      )
        return 'deferred';
      return 'failed';
    }
    operation = stored;
    if (!operation) {
      const latest = await getLatestVersionToken(
        recording.bibleTextId,
        projectUnitId,
      );
      if (signal?.aborted) {
        await setRecordingSyncStatus(recording.id, 'pending', intentVersion);
        throwIfAborted(signal);
      }
      operation = {
        recordingId: recording.id,
        intentVersion,
        baseVersionToken: latest ?? null,
        phase: 'prepared',
        updatedAt: options.now(),
      };
      if (!writeUploadOperation(operation)) {
        const message = 'Could not save upload state on this device';
        if (
          (await markRecordingFailed(recording.id, message, intentVersion)) ===
          false
        )
          return 'deferred';
        return 'failed';
      }
    }
  }

  let lastMessage = 'Upload failed';
  let didMarkUploaded = false;
  let didAcceptCleanResponse = false;
  let didMarkConflicted = false;
  let receiptPersisted = false;
  let putInFlight = false;

  const acceptedScope = {
    bibleTextId: recording.bibleTextId,
    projectUnitId,
    localFilePath: recording.localFilePath,
    recordedByUserId: recording.recordedByUserId,
  };

  // Server state already reflects this recording: persist the receipt, then
  // the generation-checked local marker (#886).
  const commitConflicted = async (
    versionToken: number,
    serverTakeId: number | null,
  ): Promise<TakeUploadOutcome> => {
    // Set flag BEFORE transaction to prevent retries if transaction fails.
    // Upload already succeeded on server; transaction failure should not retry.
    didMarkConflicted = true;
    receiptPersisted = persistUploadReceipt({
      recordingId: recording.id,
      uploadIntentVersion: intentVersion,
      acceptedScope,
      kind: 'conflicted',
      bibleTextId: recording.bibleTextId,
      versionToken,
      serverTakeId,
      acceptedAt: new Date().toISOString(),
    });
    const applied = await markRecordingAndChapterConflicted(
      recording.id,
      recording.bibleTextId,
      versionToken,
      serverTakeId,
      intentVersion,
      recording,
    );
    if (applied !== false) {
      clearUploadReceipt(recording.id);
      clearUploadOperation(recording.id, intentVersion);
    }
    if (applied === false) {
      // A later selection owns the marker. Keep the take id, stop re-applying.
      retainUploadReceiptUnbound(recording.id);
      return 'deferred';
    }
    log.info('Recording uploaded with conflict', {
      recordingId: recording.id,
      versionToken,
      recordedByUserId: recording.recordedByUserId,
      serverTakeId,
    });
    throwIfAborted(signal);
    return 'conflicted';
  };

  const commitUploaded = async (
    unitResponse: VerseAudioResponse,
    serverTakeId: number | null,
  ): Promise<TakeUploadOutcome> => {
    const blobKey = blobKeyFromVerseAudioResponse(unitResponse);
    // Server acceptance is distinct from the following local acknowledgement.
    // Persist the receipt to KV first so a failed SQLite marker can be
    // reconciled later without replaying the PUT (#886).
    didAcceptCleanResponse = true;
    receiptPersisted = persistUploadReceipt({
      recordingId: recording.id,
      uploadIntentVersion: intentVersion,
      acceptedScope,
      kind: 'uploaded',
      bibleTextId: recording.bibleTextId,
      versionToken: unitResponse.versionToken,
      serverTakeId,
      blobKey,
      acceptedAt: new Date().toISOString(),
    });
    const applied = await markRecordingUploaded(
      recording.id,
      blobKey,
      unitResponse.versionToken,
      serverTakeId,
      intentVersion,
      recording,
    );
    if (applied !== false) {
      clearUploadReceipt(recording.id);
      clearUploadOperation(recording.id, intentVersion);
    }
    didMarkUploaded = true;
    if (applied === false) {
      retainUploadReceiptUnbound(recording.id);
      return 'deferred';
    }
    log.info('Recording uploaded', {
      recordingId: recording.id,
      blobKey,
      versionToken: unitResponse.versionToken,
      recordedByUserId: recording.recordedByUserId,
    });
    // Abort after a successful put still counts as uploaded (server has bytes).
    throwIfAborted(signal);
    return 'uploaded';
  };

  // The recording is kept locally. Later automatic passes only re-read the
  // unit (they can confirm, never PUT); only
  // `chooseLocalTakeAfterUnresolvedActivation` starts a new attempt.
  const markActivationUnresolved = async (detail: {
    reason: string;
    serverTakeId: number | null;
    observedVersionToken: number | null;
  }): Promise<TakeUploadOutcome> => {
    if (operation) {
      operation = {
        ...operation,
        phase: 'unresolved',
        serverTakeId: detail.serverTakeId,
        observedVersionToken: detail.observedVersionToken,
        reason: detail.reason,
        updatedAt: options.now(),
      };
      writeUploadOperation(operation);
    }
    log.warn('Recording activation unresolved; not replaying', {
      recordingId: recording.id,
      serverTakeId: detail.serverTakeId,
    });
    if (
      (await markRecordingFailed(
        recording.id,
        detail.reason,
        intentVersion,
        detail.serverTakeId,
      )) === false
    )
      return 'deferred';
    return 'failed';
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);

    try {
      await assertLocalFileExists(recording.localFilePath);

      if (operation && operation.phase !== 'prepared') {
        const decision = await reconcileActivation(
          recording,
          operation,
          token,
          signal,
        );
        if (decision.kind === 'confirmed') {
          return decision.unit.conflictStatus === 'conflict'
            ? await commitConflicted(
                decision.unit.versionToken,
                decision.takeId,
              )
            : await commitUploaded(decision.unit, decision.takeId);
        }
        if (decision.kind === 'unresolved') {
          return await markActivationUnresolved(decision);
        }
        // Once unresolved, only a new generation (explicit user choice) may
        // send this activation again; a re-check can only confirm it.
        if (operation.phase === 'unresolved') {
          return await markActivationUnresolved({
            reason: operation.reason ?? ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
            serverTakeId: operation.serverTakeId ?? null,
            observedVersionToken: operation.observedVersionToken ?? null,
          });
        }
        if (decision.versionMoved) {
          operation = {
            ...operation,
            movedReplays: (operation.movedReplays ?? 0) + 1,
          };
        }
      }

      const durationSeconds =
        recording.durationMs !== null && Number.isFinite(recording.durationMs)
          ? recording.durationMs / 1000
          : undefined;

      const baseVersionToken = operation
        ? operation.baseVersionToken ?? undefined
        : await getLatestVersionToken(recording.bibleTextId, projectUnitId);
      // Cancellation can arrive while local preflight is awaiting the DB.
      throwIfAborted(signal);

      if (operation) {
        operation = {
          ...operation,
          phase: 'dispatched',
          updatedAt: options.now(),
        };
        // Without this marker a lost ack after a restart would replay blind.
        if (!writeUploadOperation(operation)) {
          const message = 'Could not save upload state on this device';
          if (
            (await markRecordingFailed(
              recording.id,
              message,
              intentVersion,
            )) === false
          )
            return 'deferred';
          return 'failed';
        }
      }

      putInFlight = true;
      const response = await FluentAPI.uploadVerseAudio(
        {
          projectUnitId: recording.projectUnitId,
          bibleTextId: recording.bibleTextId,
          file: {
            uri: recording.localFilePath,
            name: fileNameFromPath(recording.localFilePath),
            type: contentTypeFromPath(recording.localFilePath),
          },
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
          ...(baseVersionToken !== undefined ? { baseVersionToken } : {}),
          ...(pericopeRange
            ? { granularity: 'pericope' as const, ...pericopeRange }
            : {}),
          activate,
        },
        token,
        // Pause/cancel aborts the in-flight PUT instead of waiting for the
        // 30 s transport timeout (#886). The row is reset to pending in
        // the catch below; the operation stays dispatched, so the next
        // attempt reads the unit back before any re-PUT.
        ...(signal ? [{ signal }] : []),
      );
      putInFlight = false;

      let serverTakeId = takeIdFromVerseAudioResponse(response, activate);

      if (activate) {
        const activation = activationStateFromResponse(response);
        if (activation === 'conflicted') {
          return await commitConflicted(response.versionToken, serverTakeId);
        }
        // A 200 that stored the bytes but left another take active (stale
        // precondition on bytes the server already had) is not a selection.
        if (activation === 'stored_not_active') {
          return await markActivationUnresolved({
            reason: ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
            serverTakeId,
            observedVersionToken: response.versionToken,
          });
        }
        // No `takeId` (pre-#465 API): the 200 alone does not show which take
        // is active, so confirm by content before reporting a selection.
        if (activation === 'unverified') {
          const activeTake = response.takes.find(
            take => take.id === response.activeTakeId,
          );
          const localHash = (
            await sha256File(recording.localFilePath, { signal })
          ).toLowerCase();
          if (
            !activeTake ||
            !isSha256Hex(activeTake.contentHash) ||
            activeTake.contentHash.toLowerCase() !== localHash
          ) {
            return await markActivationUnresolved({
              reason: ACTIVATION_OTHER_TAKE_ACTIVE_MESSAGE,
              serverTakeId: null,
              observedVersionToken: response.versionToken,
            });
          }
          serverTakeId = activeTake.id;
        }
      }

      // A stored-only take never changes the active selection, so a unit
      // already in conflict says nothing about this take.
      return await commitUploaded(response, serverTakeId);
    } catch (error) {
      // A rejected PUT that the server cannot have applied needs no
      // reconciliation before the next attempt.
      if (
        putInFlight &&
        operation?.phase === 'dispatched' &&
        !isAbortError(error) &&
        !isPossiblyAppliedUploadFailure(error)
      ) {
        operation = {
          ...operation,
          phase: 'prepared',
          updatedAt: options.now(),
        };
        writeUploadOperation(operation);
      }
      putInFlight = false;

      if (isAbortError(error) || signal?.aborted) {
        if (!didMarkUploaded && !didMarkConflicted) {
          await setRecordingSyncStatus(
            recording.id,
            'pending',
            recording.uploadIntentVersion ?? 0,
          );
        }
        throwIfAborted(signal);
        throw error;
      }

      if (isAuthError(error)) {
        await setRecordingSyncStatus(
          recording.id,
          'pending',
          recording.uploadIntentVersion ?? 0,
        );
        if (tokenUserId) {
          await handleUploadAuthFailure(tokenUserId);
        }
        log.error('Recording upload auth failure', {
          recordingId: recording.id,
          tokenUserId,
          error: error.message,
        });
        throw error;
      }

      // Accepted responses must not be resent because local persistence failed.
      // With a durable receipt the next pass reconciles the marker locally;
      // without one (receipt write failed) the next pass replays the PUT and
      // relies on the server's content-hash dedupe (#886).
      if (didAcceptCleanResponse || didMarkConflicted) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to persist accepted upload locally';
        log.error('DB transaction failed after accepted upload response', {
          recordingId: recording.id,
          error: message,
          receiptPersisted,
        });
        return 'failed';
      }

      const terminalMissing =
        error instanceof Error &&
        (error as Error & { terminal?: boolean }).terminal === true;
      if (terminalMissing) {
        lastMessage = error.message;
        if (
          (await markRecordingFailed(
            recording.id,
            lastMessage,
            recording.uploadIntentVersion ?? 0,
          )) === false
        )
          return 'deferred';
        return 'failed';
      }

      const outcome = outcomeFromVerseAudioFailure(error);
      lastMessage = outcome.message;

      // Stored-only uploads: save currentVersionToken from 409 before retry
      // to avoid a stale token loop. An activation never adopts it: the
      // next attempt reconciles under the operation's original precondition.
      if (
        !operation &&
        outcome.kind === 'retryable' &&
        outcome.currentVersionToken
      ) {
        try {
          await updateRecordingVersionToken(
            recording.id,
            outcome.currentVersionToken,
          );
          log.info('Saved currentVersionToken from 409 before retry', {
            recordingId: recording.id,
            currentVersionToken: outcome.currentVersionToken,
          });
        } catch (saveError) {
          log.error('Failed to save currentVersionToken from 409', {
            recordingId: recording.id,
            error:
              saveError instanceof Error ? saveError.message : 'Unknown error',
          });
          // Don't block retry - better to retry with stale token than fail completely
        }
      }

      if (!outcome.retryable || attempt === maxAttempts) {
        if (isNetworkTransportError(error)) {
          log.info('Upload paused after network failure; leaving pending', {
            recordingId: recording.id,
            attempt,
            message: lastMessage,
          });
          await setRecordingSyncStatus(
            recording.id,
            'pending',
            recording.uploadIntentVersion ?? 0,
          );
          throw new UploadNetworkInterruptedError(lastMessage);
        }

        log.error('Recording upload failed', {
          recordingId: recording.id,
          attempt,
          message: lastMessage,
          retryable: outcome.retryable,
        });
        if (
          (await markRecordingFailed(
            recording.id,
            lastMessage,
            recording.uploadIntentVersion ?? 0,
          )) === false
        )
          return 'deferred';
        return 'failed';
      }

      log.warn('Recording upload retrying', {
        recordingId: recording.id,
        attempt,
        maxAttempts,
        message: lastMessage,
      });
      await delay(attempt * 500);
      if (signal?.aborted) {
        await setRecordingSyncStatus(
          recording.id,
          'pending',
          recording.uploadIntentVersion ?? 0,
        );
        throwIfAborted(signal);
      }
    }
  }

  if (
    (await markRecordingFailed(
      recording.id,
      lastMessage,
      recording.uploadIntentVersion ?? 0,
    )) === false
  )
    return 'deferred';
  return 'failed';
}

/**
 * Per-take result of one upload attempt sequence. `deferred`: the row's
 * intent generation moved while this pass held it, so nothing was marked.
 */
type TakeUploadOutcome = 'deferred' | 'uploaded' | 'conflicted' | 'failed';

/** Distinct chapter in a pending pass. Orchestrator sessions key the same way. */
function chapterKey(recording: PendingRecording): string {
  return `${recording.bookId}:${recording.chapterNumber}`;
}

async function deleteOneRecordingTake(
  deletion: PendingRecordingDeletion,
  options: {
    signal?: AbortSignal;
    delay: (ms: number) => Promise<void>;
    maxAttempts: number;
    token: string;
    tokenUserId: string | null;
  },
): Promise<TakeDeletionOutcome> {
  const { signal, delay, maxAttempts, token, tokenUserId } = options;
  let lastMessage = 'Delete take failed';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    try {
      const { versionToken } = await FluentAPI.deleteVerseAudioTake(
        {
          projectUnitId: deletion.projectUnitId,
          bibleTextId: deletion.bibleTextId,
          takeId: deletion.serverTakeId,
        },
        token,
        // Cancelled deletes stay queued; a DELETE the server already applied
        // resolves as 404 → already_absent on the next pass (#886). That
        // path skips raiseVerseVersionToken, so the next activating upload
        // may cost one 409 before the existing conflict retry resyncs the
        // token.
        ...(signal ? [{ signal }] : []),
      );
      await clearRecordingDeletion(deletion.id);
      // Deleting the active take promotes another one and bumps the token;
      // the local promotion's activating upload must not send a stale base.
      if (versionToken !== null) {
        await raiseVerseVersionToken(
          deletion.bibleTextId,
          deletion.projectUnitId,
          versionToken,
        );
      }
      log.info('Recording take deleted on server', {
        deletionId: deletion.id,
        serverTakeId: deletion.serverTakeId,
      });
      return { kind: 'deleted', versionToken };
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throwIfAborted(signal);
        throw error;
      }

      if (isApiError(error) && error.status === 404) {
        await clearRecordingDeletion(deletion.id);
        log.info('Recording take already absent on server', {
          deletionId: deletion.id,
          serverTakeId: deletion.serverTakeId,
        });
        return { kind: 'already_absent' };
      }

      if (isAuthError(error)) {
        if (tokenUserId) {
          await handleUploadAuthFailure(tokenUserId);
        }
        log.error('Recording take delete auth failure', {
          deletionId: deletion.id,
          tokenUserId,
          error: error.message,
        });
        throw error;
      }

      lastMessage =
        error instanceof Error ? error.message : 'Delete take failed';
      if (attempt === maxAttempts) {
        if (isNetworkTransportError(error)) {
          log.info(
            'Take delete paused after network failure; leaving pending',
            {
              deletionId: deletion.id,
              attempt,
              message: lastMessage,
            },
          );
          throw new UploadNetworkInterruptedError(lastMessage);
        }
        log.error('Recording take delete failed', {
          deletionId: deletion.id,
          attempt,
          message: lastMessage,
        });
        return { kind: 'failed', message: lastMessage };
      }

      log.warn('Recording take delete retrying', {
        deletionId: deletion.id,
        attempt,
        maxAttempts,
        message: lastMessage,
      });
      await delay(attempt * 500);
    }
  }

  return { kind: 'failed', message: lastMessage };
}

/**
 * Drain every queued take delete (all owners). A terminal failure leaves the
 * row queued and is counted — callers must not report the pass complete
 * while `failed > 0` (#886). Network interruption and auth failures still
 * throw, as for takes.
 */
async function runDeletePass(
  token: string,
  options: {
    signal?: AbortSignal;
    delay: (ms: number) => Promise<void>;
    maxAttempts: number;
  },
): Promise<DeletePassResult> {
  const pending = await getPendingRecordingDeletions();
  const result: DeletePassResult = {
    attempted: pending.length,
    deleted: 0,
    failed: 0,
    failedForActiveUser: 0,
  };
  if (pending.length === 0) {
    return result;
  }
  const activeUserId = Number(getActiveUserId());
  const ownedByActiveUser = (deletion: PendingRecordingDeletion): boolean =>
    Number.isFinite(activeUserId) && activeUserId > 0
      ? deletion.recordedByUserId === activeUserId
      : deletion.recordedByUserId === null;

  log.info('Starting recording delete pass', { count: pending.length });

  for (const deletion of pending) {
    throwIfAborted(options.signal);
    const { token: deleteToken, userId: tokenUserId } =
      await resolveOwnerAuthToken(deletion.recordedByUserId, token, {
        id: deletion.id,
        kind: 'delete',
      });
    const outcome = await deleteOneRecordingTake(deletion, {
      signal: options.signal,
      delay: options.delay,
      maxAttempts: options.maxAttempts,
      token: deleteToken,
      tokenUserId,
    });
    if (outcome.kind === 'failed') {
      result.failed += 1;
      if (ownedByActiveUser(deletion)) {
        result.failedForActiveUser += 1;
      }
    } else {
      result.deleted += 1;
    }
  }

  if (result.failed > 0) {
    log.warn('Recording delete pass left rows pending', {
      failed: result.failed,
      failedForActiveUser: result.failedForActiveUser,
      deleted: result.deleted,
    });
  }
  return result;
}

/**
 * Session-level delete drain for the orchestrator (#886): runs once per
 * upload session before the first chapter, so chapter passes no longer
 * re-scan every account's deletes. Unscoped manual passes still drain inline.
 */
export async function drainPendingRecordingDeletions(
  token: string,
  options: RecordingSyncOptions = {},
): Promise<DeletePassResult> {
  if (!token) {
    throw new Error('Auth token is required for take delete drain');
  }
  getApiBaseUrl();
  return runDeletePass(token, {
    signal: options.signal,
    delay: options.delay ?? defaultDelay,
    maxAttempts: options.maxAttempts ?? MAX_UPLOAD_ATTEMPTS,
  });
}

async function runUploadPass(
  token: string,
  options: RecordingSyncOptions = {},
): Promise<UploadResult> {
  // Fail fast if API base URL is missing (never use @env).
  getApiBaseUrl();

  const delay = options.delay ?? defaultDelay;
  const maxAttempts = options.maxAttempts ?? MAX_UPLOAD_ATTEMPTS;
  // Chapter-scoped passes run inside an orchestrator session, which drains
  // deletes once up front via `drainPendingDeletions` (#886). Only
  // unscoped passes (manual retry) drain inline.
  const deletePass: DeletePassResult =
    options.chapter === undefined
      ? await runDeletePass(token, {
          signal: options.signal,
          delay,
          maxAttempts,
        })
      : { attempted: 0, deleted: 0, failed: 0, failedForActiveUser: 0 };

  // #855: before evaluating any pending take, establish fresh project
  // membership for the active account. Recordings whose owner lost
  // membership stay 'held' (never removed, never failed) and are excluded
  // from the pending read below, so they are not uploaded in this pass. The
  // held count is per-pass bookkeeping for the log: takes newly held must not
  // defer the still-eligible rows queued for other projects/chapters.
  // A failed reconciliation means membership could not be confirmed, so
  // nothing is uploaded and all pending rows are deferred safely.
  //
  // Reconciliation only reads the cached `user_projects`, so an unscoped pass
  // (manual retry, which has no orchestrator session ahead of it) refreshes
  // membership from the server first: a removal that happened while offline is
  // otherwise invisible and the take would upload into a permanent failure
  // (#848). Chapter-scoped passes inherit the refresh their session ran, so
  // they do not repeat the request once per chapter.
  const activeUserId = Number(getActiveUserId());
  const membershipUserId =
    Number.isFinite(activeUserId) && activeUserId > 0 ? activeUserId : null;
  // Membership is verified per owner: one account that cannot be confirmed
  // defers only its own takes (#855). Signed-out passes (no active account)
  // keep the cache-only behavior.
  let reconcileFailed = false;
  let gateFailed = false;
  let membershipHeld = 0;
  let verifiedOwners: ReadonlySet<number> = new Set();
  try {
    if (membershipUserId !== null) {
      const owners = await getRecordingOwnerIds(membershipUserId);
      verifiedOwners =
        options.chapter === undefined
          ? await refreshMembershipForOwners(owners)
          : getVerifiedMembershipOwners();
      gateFailed = owners.some(owner => !verifiedOwners.has(owner));
      const outcome = await reconcileHeldRecordings(membershipUserId, [
        ...verifiedOwners,
      ]);
      membershipHeld = outcome.held;
      if (outcome.held > 0 || outcome.released > 0) {
        emitHeldRecordingsChanged();
      }
    }
  } catch (error) {
    log.warn('Held-recording membership reconciliation failed; deferring', {
      error,
    });
    reconcileFailed = true;
  }

  const pending = await getPendingRecordings(options.chapter);

  log.info('Starting recording upload pass', {
    count: pending.length,
    chapter: options.chapter ?? null,
    membershipEstablished: !reconcileFailed && !gateFailed,
    membershipHeld,
  });

  // Chapter-scoped passes run inside an orchestrator session. That session
  // already emits start/progress/complete per chapter. Emitting the same
  // events here (per take, including complete) resets the Sync page and the
  // notification and can report more takes than chapters (#600).
  const orchestratorOwnsSession = options.chapter !== undefined;
  const emitPassEvent = (event: UploadSessionEvent): void => {
    if (orchestratorOwnsSession) {
      return;
    }
    emitUploadSessionEvent(event);
  };

  const takesLeftByChapter = new Map<string, number>();
  if (!orchestratorOwnsSession) {
    for (const recording of pending) {
      const key = chapterKey(recording);
      takesLeftByChapter.set(key, (takesLeftByChapter.get(key) ?? 0) + 1);
    }
  }
  const totalChapters = takesLeftByChapter.size;
  let completedChapters = 0;
  emitPassEvent({ type: 'start', totalChapters });

  const now = options.now ?? Date.now;
  let uploaded = 0;
  let conflicted = 0;
  let failed = 0;
  let deferred = 0;
  const reportTakeProgress = (): void => {
    options.onTakeProgress?.({
      completedTakes: uploaded + conflicted,
      failedTakes: failed,
      totalTakes: pending.length,
    });
  };
  if (pending.length > 0) {
    reportTakeProgress();
  }

  const uploadTokens = createPassOwnerTokens();
  try {
    for (const recording of pending) {
      throwIfAborted(options.signal);

      // Membership gate: a take whose owner's membership could not be
      // confirmed (refresh or reconcile failed) is deferred, never marked
      // failed or deleted. It uploads automatically once membership is
      // restored on a later pass.
      const ownerId = recording.recordedByUserId ?? membershipUserId;
      if (
        reconcileFailed ||
        (membershipUserId !== null &&
          (ownerId === null || !verifiedOwners.has(ownerId)))
      ) {
        deferred += 1;
        uploadTokens.clear();
        continue;
      }

      const { token: uploadToken, userId: tokenUserId } =
        await uploadTokens.resolve(recording, token);
      const result = await uploadOneRecording(recording, {
        signal: options.signal,
        delay,
        maxAttempts,
        token: uploadToken,
        tokenUserId,
        now,
      });
      if (result === 'uploaded') {
        uploaded += 1;
      } else if (result === 'conflicted') {
        conflicted += 1;
      } else if (result === 'deferred') {
        deferred += 1;
      } else {
        failed += 1;
      }
      if (result !== 'uploaded' && result !== 'conflicted') {
        uploadTokens.clear();
      }
      reportTakeProgress();

      // Chapter workers never own session progress (#600 / #682). Failed takes
      // stay pending — do not count the chapter complete on a failed result.
      if (
        orchestratorOwnsSession ||
        (result !== 'uploaded' && result !== 'conflicted')
      ) {
        continue;
      }
      const key = chapterKey(recording);
      const left = (takesLeftByChapter.get(key) ?? 1) - 1;
      takesLeftByChapter.set(key, left);
      if (left === 0) {
        completedChapters += 1;
        emitPassEvent({
          type: 'progress',
          completedChapters,
          totalChapters,
        });
      }
    }

    const deletionsFailed = deletePass.failed;
    // `complete` means nothing is left for this pass. Terminal failures keep
    // rows pending, so finish with `idle`: the status store and notification
    // reset, but no success signal is sent (Home only refreshes on `complete`).
    emitPassEvent({
      type:
        failed > 0 ||
        deferred > 0 ||
        deletionsFailed > 0 ||
        reconcileFailed ||
        gateFailed
          ? 'idle'
          : 'complete',
    });
    log.info('Recording upload pass finished', {
      uploaded,
      conflicted,
      failed,
      deferred,
      deletionsFailed,
      deletionsDone: deletePass.deleted,
    });
    return { uploaded, conflicted, failed, deferred, deletionsFailed };
  } catch (error) {
    if (isAbortError(error) || options.signal?.aborted) {
      emitPassEvent({ type: 'cancelled' });
    } else {
      emitPassEvent({ type: 'idle' });
    }
    throw error;
  }
}

/**
 * Upload latest pending recordings (optionally filtered to one chapter).
 * Single-flight: overlapping calls share the in-flight promise.
 *
 * Attribution (#105): each recording uploads under its `recorded_by_user_id`
 * token when credentials exist; otherwise the pass `token` is used.
 */
export async function syncPendingRecordings(
  token: string,
  options: RecordingSyncOptions = {},
): Promise<UploadResult> {
  if (!token) {
    throw new Error('Auth token is required for recording upload');
  }

  if (inFlight) {
    log.warn('Recording upload already in progress; joining in-flight pass');
    return awaitWithAbort(inFlight, options.signal);
  }

  inFlight = runUploadPass(token, options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Direct chapter upload helper (tests / ad-hoc callers). Production wires
 * `createChapterUploadWorker` via `registerRecordingUploadWorker` (#150).
 * Same failed-count contract as the registered worker. Like the worker's
 * chapter passes it does not drain take deletes — the orchestrator does that
 * once per session (#886).
 */
export async function uploadChapterRecordings(
  chapter: PendingUploadChapter,
  signal: AbortSignal,
  token?: string,
): Promise<void> {
  const resolved = token ?? authToken.get();
  if (!resolved) {
    throw new Error('No auth token available for chapter upload');
  }
  const result = await syncPendingRecordings(resolved, { chapter, signal });
  throwIfChapterPassIncomplete(result);
}

/**
 * Chapter passes report failure to the orchestrator by throwing so it does
 * not emit `complete` / clear its retry budget while rows stay pending.
 * Conflicts are successful server accepts. (Deletes are drained once per
 * session by `drainPendingDeletions`, not per chapter — #886.)
 */
function throwIfChapterPassIncomplete(result: UploadResult): void {
  if (result.failed > 0) {
    throw new Error(`Chapter upload failed for ${result.failed} recording(s)`);
  }
  if (result.deferred > 0) {
    throw new Error(
      `Chapter upload deferred ${result.deferred} recording(s) after a local change`,
    );
  }
}

export function createChapterUploadWorker(
  getToken: () => string | null = () => authToken.get(),
): ChapterUploadWorker {
  return {
    uploadChapter: async (chapter, signal, onTakeProgress) => {
      const token = getToken();
      if (!token) {
        throw new Error('No auth token available for chapter upload');
      }
      // Chapter-scoped passes stay silent (#682) apart from the per-take
      // callback the orchestrator owns (#886). Propagate hard failures so
      // the orchestrator can retry instead of emitting complete while work
      // still needs attention. Conflicts are successful server accepts.
      const result = await syncPendingRecordings(token, {
        chapter,
        signal,
        onTakeProgress,
      });
      throwIfChapterPassIncomplete(result);
    },
    drainPendingDeletions: async signal => {
      const token = getToken();
      if (!token) {
        throw new Error('No auth token available for take delete drain');
      }
      const result = await drainPendingRecordingDeletions(token, { signal });
      return { failed: result.failedForActiveUser };
    },
  };
}

/** Register the real chapter upload worker with the #150 orchestrator. */
export function registerRecordingUploadWorker(): void {
  setChapterUploadWorker(createChapterUploadWorker());
}

/** Test-only: clear single-flight state between cases. */
export function __resetRecordingSyncForTests(): void {
  inFlight = null;
}
