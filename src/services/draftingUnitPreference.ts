import {
  getRecordCaptureGate,
  subscribeRecordCaptureGate,
} from '../navigation/recordCaptureGate';
import { kvStorage } from './storage';

export type DraftingUnit = 'verse' | 'pericope';

/** Pending sync intent: a concrete unit, or null = delete displayMode (reset). */
export type DisplayModeSyncIntent = DraftingUnit | null;

const DEFAULT_DRAFTING_UNIT: DraftingUnit = 'verse';
const DELETE_INTENT = '__delete__';

const draftingUnitKey = (userId: string) => `${userId}:drafting_unit`;
const draftingUnitDirtyKey = (userId: string) =>
  `${userId}:drafting_unit_dirty`;
const draftingUnitRevisionKey = (userId: string) =>
  `${userId}:drafting_unit_revision`;
const draftingUnitPendingKey = (userId: string) =>
  `${userId}:drafting_unit_pending`;

type DraftingUnitListener = () => void;

const listeners: DraftingUnitListener[] = [];

/** Remote values deferred until capture (recording/paused) ends. */
const deferredRemoteByUser = new Map<string, DraftingUnit>();
let captureGateSubscribed = false;

function isDraftingUnit(value: string | undefined): value is DraftingUnit {
  return value === 'verse' || value === 'pericope';
}

function ensureCaptureGateSubscription(): void {
  if (captureGateSubscribed) return;
  captureGateSubscribed = true;
  subscribeRecordCaptureGate(active => {
    if (active) return;
    flushDeferredRemoteApplies();
  });
}

function bumpRevision(userId: string): number {
  const next = getDraftingUnitRevision(userId) + 1;
  kvStorage.setItemSync(draftingUnitRevisionKey(userId), String(next));
  return next;
}

function writePendingIntent(
  userId: string,
  intent: DisplayModeSyncIntent,
): void {
  kvStorage.setItemSync(
    draftingUnitPendingKey(userId),
    intent === null ? DELETE_INTENT : intent,
  );
}

export function getDraftingUnit(userId: string): DraftingUnit {
  if (!userId) return DEFAULT_DRAFTING_UNIT;
  const raw = kvStorage.getItemSync(draftingUnitKey(userId)) ?? undefined;
  return isDraftingUnit(raw) ? raw : DEFAULT_DRAFTING_UNIT;
}

export function getDraftingUnitRevision(userId: string): number {
  if (!userId) return 0;
  const raw = kvStorage.getItemSync(draftingUnitRevisionKey(userId));
  const parsed =
    raw === null || raw === undefined ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Local pending intent for the dirty push. `null` means PUT displayMode: null
 * (reset). When not dirty, returns the current unit for convenience.
 */
export function getDisplayModeSyncIntent(
  userId: string,
): DisplayModeSyncIntent {
  if (!userId) return DEFAULT_DRAFTING_UNIT;
  if (!isDraftingUnitDirty(userId)) {
    return getDraftingUnit(userId);
  }
  const raw = kvStorage.getItemSync(draftingUnitPendingKey(userId));
  if (raw === DELETE_INTENT) return null;
  const pending = raw ?? undefined;
  if (isDraftingUnit(pending)) return pending;
  return getDraftingUnit(userId);
}

export function setDraftingUnit(unit: DraftingUnit, userId: string): void {
  if (!userId) return;
  kvStorage.setItemSync(draftingUnitKey(userId), unit);
  writePendingIntent(userId, unit);
  bumpRevision(userId);
  kvStorage.setItemSync(draftingUnitDirtyKey(userId), 'true');
  deferredRemoteByUser.delete(userId);
  notifyDraftingUnitChanged();
}

/**
 * Programmatic reset: local Verse + dirty delete intent (PUT displayMode null).
 * No settings UI — used by sync/helpers only (#754).
 */
export function resetDraftingUnitPreference(userId: string): void {
  if (!userId) return;
  kvStorage.setItemSync(draftingUnitKey(userId), DEFAULT_DRAFTING_UNIT);
  writePendingIntent(userId, null);
  bumpRevision(userId);
  kvStorage.setItemSync(draftingUnitDirtyKey(userId), 'true');
  deferredRemoteByUser.delete(userId);
  notifyDraftingUnitChanged();
}

export function isDraftingUnitDirty(userId: string): boolean {
  if (!userId) return false;
  return kvStorage.getItemSync(draftingUnitDirtyKey(userId)) === 'true';
}

/**
 * Unconditional clear — tests / recovery only. Sync must use
 * {@link acknowledgeDraftingUnitSync}.
 */
export function clearDraftingUnitDirty(userId: string): void {
  if (!userId) return;
  kvStorage.removeItemSync(draftingUnitDirtyKey(userId));
  kvStorage.removeItemSync(draftingUnitPendingKey(userId));
}

export type AcknowledgeDraftingUnitSyncArgs = {
  userId: string;
  /** User id captured when the request was issued. */
  capturedUserId: string;
  /** Local revision captured when the request was issued. */
  capturedRevision: number;
  /**
   * Intent captured at request time. `null` = deletion.
   * Value ACK requires the response to echo this exact displayMode.
   */
  capturedIntent: DisplayModeSyncIntent;
  /**
   * `displayMode` from the ACK settings blob, if the key is present.
   * `undefined` means the key was omitted (normalized delete or legacy strip).
   * Explicit `null` is optional on capability-bearing delete ACKs.
   */
  acknowledgedDisplayMode: DraftingUnit | null | undefined;
  /** True when the ACK settings object own-property includes displayMode. */
  acknowledgedDisplayModeKeyPresent: boolean;
  /**
   * True when the ACK response carried both
   * `settingsCapabilities.partialMerge === true` and
   * `settingsCapabilities.displayMode === true`. Required for delete-omit ACK;
   * value ACK still requires an exact enum echo.
   */
  settingsCapabilitiesSupported: boolean;
};

/**
 * Conditionally clears dirty after a PUT ACK. Keeps dirty when:
 * - captured user ≠ store user (caller mismatch)
 * - local revision moved (newer edit / ABA)
 * - value ACK does not echo the exact captured enum
 * - delete ACK lacks capabilities, or still has a concrete displayMode
 *   (legacy strip omit must not clear without capabilities)
 */
export function acknowledgeDraftingUnitSync(
  args: AcknowledgeDraftingUnitSyncArgs,
): boolean {
  const {
    userId,
    capturedUserId,
    capturedRevision,
    capturedIntent,
    acknowledgedDisplayMode,
    acknowledgedDisplayModeKeyPresent,
    settingsCapabilitiesSupported,
  } = args;

  if (!userId || userId !== capturedUserId) return false;
  if (!isDraftingUnitDirty(userId)) return false;
  if (getDraftingUnitRevision(userId) !== capturedRevision) return false;

  if (capturedIntent === null) {
    // Capability-bearing #434 normalize omits deleted keys (settings:null is
    // also an absent-key case). Explicit null echo is optional, not required.
    // Without both capability flags, omit looks like legacy strip — keep dirty.
    const deletionAcked =
      settingsCapabilitiesSupported &&
      (!acknowledgedDisplayModeKeyPresent || acknowledgedDisplayMode === null);
    if (!deletionAcked) return false;
  } else if (acknowledgedDisplayMode !== capturedIntent) {
    return false;
  }

  clearDraftingUnitDirty(userId);
  return true;
}

/**
 * Apply a clean remote displayMode (or Verse default). No-ops when dirty.
 * Defers while record capture gate is active (recording or paused).
 */
export function applyRemoteDraftingUnit(
  userId: string,
  unit: DraftingUnit,
): 'applied' | 'skipped_dirty' | 'deferred_capture' | 'noop' {
  if (!userId) return 'noop';
  if (isDraftingUnitDirty(userId)) return 'skipped_dirty';

  ensureCaptureGateSubscription();
  if (getRecordCaptureGate()) {
    deferredRemoteByUser.set(userId, unit);
    return 'deferred_capture';
  }

  return applyRemoteDraftingUnitNow(userId, unit);
}

function applyRemoteDraftingUnitNow(
  userId: string,
  unit: DraftingUnit,
): 'applied' | 'skipped_dirty' | 'noop' {
  if (!userId) return 'noop';
  if (isDraftingUnitDirty(userId)) return 'skipped_dirty';

  const current = getDraftingUnit(userId);
  if (current === unit) {
    deferredRemoteByUser.delete(userId);
    return 'noop';
  }

  kvStorage.setItemSync(draftingUnitKey(userId), unit);
  kvStorage.removeItemSync(draftingUnitPendingKey(userId));
  deferredRemoteByUser.delete(userId);
  notifyDraftingUnitChanged();
  return 'applied';
}

export function flushDeferredRemoteApplies(): void {
  if (getRecordCaptureGate()) return;
  const entries = [...deferredRemoteByUser.entries()];
  for (const [userId, unit] of entries) {
    applyRemoteDraftingUnitNow(userId, unit);
  }
}

/** Test helper — clear deferred remote map + allow re-subscribe in isolation. */
export function resetDraftingUnitPreferenceRuntimeForTests(): void {
  deferredRemoteByUser.clear();
  // recordCaptureGate test resets clear listeners; allow re-subscribe.
  captureGateSubscribed = false;
}
export function subscribeToDraftingUnit(
  onStoreChange: DraftingUnitListener,
): () => void {
  listeners.push(onStoreChange);
  return () => {
    const index = listeners.indexOf(onStoreChange);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

export function notifyDraftingUnitChanged(): void {
  listeners.forEach(listener => listener());
}

export function parseDisplayMode(
  value: unknown,
): DraftingUnit | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value === 'verse' || value === 'pericope') return value;
  return undefined;
}
