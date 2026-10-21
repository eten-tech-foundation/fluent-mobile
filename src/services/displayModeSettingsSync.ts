import { logger } from '../utils/logger';
import type { UserSettingsResponse } from '../types/api/userSettings';
import { FluentAPI } from './api';
import { getConnectivitySnapshot } from './connectivity';
import {
  acknowledgeDraftingUnitSync,
  applyRemoteDraftingUnit,
  getDisplayModeSyncIntent,
  getDraftingUnitRevision,
  isDraftingUnitDirty,
  parseDisplayMode,
  type DisplayModeSyncIntent,
  type DraftingUnit,
} from './draftingUnitPreference';
import { getCredentials } from './keychain';
import { getActiveUserId } from './storage';

const log = logger.create('DisplayModeSettingsSync');

export type DisplayModePushCapture = {
  userId: string;
  token: string;
  intent: DisplayModeSyncIntent;
  revision: number;
};

/** Both fluent-api#434 flags must be strictly true — not cached across accounts. */
export function hasDisplayModeSettingsCapabilities(
  response: UserSettingsResponse | null | undefined,
): boolean {
  const caps = response?.settingsCapabilities;
  if (!caps || typeof caps !== 'object') return false;
  return caps.partialMerge === true && caps.displayMode === true;
}

function readAckDisplayMode(response: UserSettingsResponse): {
  acknowledgedDisplayMode: DraftingUnit | null | undefined;
  acknowledgedDisplayModeKeyPresent: boolean;
} {
  const settings = response.settings;
  if (
    settings === null ||
    settings === undefined ||
    typeof settings !== 'object'
  ) {
    return {
      acknowledgedDisplayMode: undefined,
      acknowledgedDisplayModeKeyPresent: false,
    };
  }
  const keyPresent = Object.prototype.hasOwnProperty.call(
    settings,
    'displayMode',
  );
  return {
    acknowledgedDisplayModeKeyPresent: keyPresent,
    acknowledgedDisplayMode: keyPresent
      ? parseDisplayMode(settings.displayMode)
      : undefined,
  };
}

/**
 * Capture still matches local dirty intent (user/revision/pending).
 * Used before GET and again before PUT so mid-flight edits skip the write.
 */
function captureStillCurrent(capture: DisplayModePushCapture): boolean {
  const { userId, intent, revision } = capture;
  if (!userId || !isDraftingUnitDirty(userId)) return false;
  if (getDraftingUnitRevision(userId) !== revision) return false;
  return getDisplayModeSyncIntent(userId) === intent;
}

/**
 * Apply a GET/PUT settings blob for `userId` when local is clean.
 * Missing/null displayMode → Verse default only when capabilities are supported.
 * Present non-enum displayMode (e.g. `VERSE`) is ignored (noop), not defaulted.
 * Never clobbers dirty locals. Unsupported servers do not apply omission defaults.
 */
export function applyUserSettingsDisplayMode(
  userId: string,
  response: UserSettingsResponse | null | undefined,
): ReturnType<typeof applyRemoteDraftingUnit> {
  if (!userId) return 'noop';
  if (isDraftingUnitDirty(userId)) return 'skipped_dirty';

  const settings = response?.settings;
  const keyPresent =
    settings !== null &&
    settings !== undefined &&
    typeof settings === 'object' &&
    Object.prototype.hasOwnProperty.call(settings, 'displayMode');
  const parsed = parseDisplayMode(
    keyPresent ? settings.displayMode : undefined,
  );
  if (parsed === 'verse' || parsed === 'pericope') {
    return applyRemoteDraftingUnit(userId, parsed);
  }

  // Present but not a recognized enum (and not null) — do not fall through to
  // the capable Verse default; treat as unreadable input.
  if (keyPresent && parsed !== null) {
    return 'noop';
  }

  if (!hasDisplayModeSettingsCapabilities(response)) {
    return 'noop';
  }

  const unit: DraftingUnit = 'verse';
  return applyRemoteDraftingUnit(userId, unit);
}

export async function resolveDisplayModePushCapture(
  userId: string,
  sessionToken?: string,
): Promise<DisplayModePushCapture | null> {
  if (!userId || !isDraftingUnitDirty(userId)) return null;

  let token = sessionToken;
  if (!token) {
    const creds = await getCredentials(userId);
    token = creds?.token;
  }
  if (!token) {
    log.warn('No token for dirty displayMode push', { userId });
    return null;
  }

  return {
    userId,
    token,
    intent: getDisplayModeSyncIntent(userId),
    revision: getDraftingUnitRevision(userId),
  };
}

/**
 * Push dirty displayMode for one account using a captured auth scope.
 * GETs capabilities for that account before any displayMode-only PUT.
 * Does not mutate the global auth token. Clears dirty only on exact ACK.
 */
export async function pushDirtyDisplayMode(
  capture: DisplayModePushCapture,
): Promise<boolean> {
  const { userId, token, intent, revision } = capture;

  if (!captureStillCurrent(capture)) {
    return false;
  }

  // Capability probe for this account's token — never cache across accounts.
  const probe = await FluentAPI.getSelfSettings(token);

  if (!captureStillCurrent(capture)) {
    log.info('displayMode PUT skipped; capture stale after capability GET', {
      userId,
      revision,
      intent,
    });
    return false;
  }

  if (!hasDisplayModeSettingsCapabilities(probe)) {
    log.info('displayMode PUT skipped; settings capabilities unsupported', {
      userId,
      capabilities: probe?.settingsCapabilities ?? null,
    });
    return false;
  }

  const response = await FluentAPI.putSelfSettings(
    { settings: { displayMode: intent } },
    token,
  );

  const ack = readAckDisplayMode(response);
  const cleared = acknowledgeDraftingUnitSync({
    userId,
    capturedUserId: userId,
    capturedRevision: revision,
    capturedIntent: intent,
    acknowledgedDisplayMode: ack.acknowledgedDisplayMode,
    acknowledgedDisplayModeKeyPresent: ack.acknowledgedDisplayModeKeyPresent,
    settingsCapabilitiesSupported: hasDisplayModeSettingsCapabilities(response),
  });

  if (!cleared) {
    log.info('displayMode PUT ACK did not clear dirty', {
      userId,
      revision,
      intent,
      ackKeyPresent: ack.acknowledgedDisplayModeKeyPresent,
      ackValue: ack.acknowledgedDisplayMode,
      capabilitiesSupported: hasDisplayModeSettingsCapabilities(response),
    });
  }

  return cleared;
}

/**
 * Pull account settings and apply displayMode when local is clean.
 * Skips applying into another account's active UI incorrectly by always
 * writing the captured `userId` keys only (per-account KV).
 */
export async function pullDisplayModeSettings(
  userId: string,
  sessionToken?: string,
): Promise<void> {
  if (!userId) return;
  if (isDraftingUnitDirty(userId)) return;

  let token = sessionToken;
  if (!token) {
    const creds = await getCredentials(userId);
    token = creds?.token;
  }
  if (!token) return;

  // Per-account revision at GET start. An edit+ACK while in flight bumps this
  // and clears dirty — discard the stale response so it cannot overwrite the
  // newly acknowledged value (dirty-only checks miss that race).
  const revisionBefore = getDraftingUnitRevision(userId);
  const response = await FluentAPI.getSelfSettings(token);

  if (getDraftingUnitRevision(userId) !== revisionBefore) {
    log.info('displayMode pull discarded; local revision moved mid-flight', {
      userId,
      revisionBefore,
      revisionAfter: getDraftingUnitRevision(userId),
    });
    return;
  }

  // Conservative: if the active user changed mid-flight, still apply only to
  // the captured userId's KV (never into a different user's keys).
  if (userId !== getActiveUserId()) {
    log.info('Applying displayMode pull to non-active account KV', {
      userId,
      activeUserId: getActiveUserId(),
    });
  }

  applyUserSettingsDisplayMode(userId, response);
}

/**
 * Normal sync step: push dirty intent (if any), then pull when clean.
 * Failures leave dirty queued for retry. Uses per-request token only.
 */
export async function syncDisplayModeSettingsForUser(
  userId: string,
  sessionToken?: string,
): Promise<void> {
  if (!userId) return;

  let acknowledged = false;
  try {
    const capture = await resolveDisplayModePushCapture(userId, sessionToken);
    if (capture) {
      acknowledged = await pushDirtyDisplayMode(capture);
    }
  } catch (error) {
    log.warn('displayMode push failed; leaving dirty for retry', {
      userId,
      error,
    });
    return;
  }

  // ACK does not bump revision; skip the follow-up GET so a stale Verse probe
  // body cannot overwrite the value we just pushed.
  if (acknowledged) return;

  try {
    if (!isDraftingUnitDirty(userId)) {
      await pullDisplayModeSettings(userId, sessionToken);
    }
  } catch (error) {
    log.warn('displayMode pull failed', { userId, error });
  }
}

/**
 * Immediate best-effort push after a local settings change. Offline / failure
 * leaves dirty for the next normal sync retry.
 */
export async function scheduleDisplayModePush(userId: string): Promise<void> {
  if (!userId || !isDraftingUnitDirty(userId)) return;

  try {
    const { isOnline } = await getConnectivitySnapshot();
    if (!isOnline) return;
  } catch {
    return;
  }

  try {
    await syncDisplayModeSettingsForUser(userId);
  } catch (error) {
    log.warn('scheduleDisplayModePush failed', { userId, error });
  }
}
