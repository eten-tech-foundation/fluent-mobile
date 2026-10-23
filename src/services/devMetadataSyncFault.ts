/**
 * DEV + EXPO_PUBLIC_E2E_MODE only: Case S metadata step fault for C0019.
 *
 * Armed exclusively from runDevMetadataSyncControl (not env alone, not full sync).
 * Modes via EXPO_PUBLIC_E2E_METADATA_FAULT_STEP:
 * - `projects` — plain non-transport Error inside syncProjects operation
 * - `projects_transport` — typed ApiError(0) at getUserProjects call boundary
 *   (app API-call seam reject; zero real HTTP; not DNS/outage proof)
 *
 * While armed, syncProjects fails every attempt until that operation's existing
 * retrySyncStep / MAX_SYNC_ATTEMPTS sequence completes, then disarms.
 * Non-transport persistence is only via production retrySyncStep →
 * setSyncError(sync_error_projects). Transport mode relies on production
 * isTransientTransportFailure → no setSyncError.
 *
 * Does not claim physical absence from release bundles — callers must gate
 * loaders; unit tests cover no-op when gates are off.
 */

import { isE2eModeEnabled } from '../config/e2eMode';
import { getApiBaseUrl } from '../config/apiBaseUrl';
import { ApiError } from '../types/api/errors';
import { getActiveUserId } from './storage';

/** Inline env check — avoid circular import with devSourceAudioFault. */
function isSourceAudioFaultEnvRequestedLocal(): boolean {
  const value = process.env.EXPO_PUBLIC_E2E_SOURCE_AUDIO_FAULT?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

export const METADATA_FAULT_STEP_PROJECTS = 'projects' as const;
export const METADATA_FAULT_STEP_PROJECTS_TRANSPORT =
  'projects_transport' as const;
export type MetadataFaultStep =
  | typeof METADATA_FAULT_STEP_PROJECTS
  | typeof METADATA_FAULT_STEP_PROJECTS_TRANSPORT;

export const ENV_METADATA_FAULT_STEP = 'EXPO_PUBLIC_E2E_METADATA_FAULT_STEP';
export const ENV_SOURCE_AUDIO_FAULT = 'EXPO_PUBLIC_E2E_SOURCE_AUDIO_FAULT';
/** Recovery opt-in: suppress Auth transfer auto-start without arming a fault. */
export const ENV_FAULT_TRANSFER_GUARD = 'EXPO_PUBLIC_E2E_FAULT_TRANSFER_GUARD';

export const REQUIRED_ACTIVE_USER_ID = '12';
export const REQUIRED_QA_API_HOST = 'qa.api.fluent.bible';

export const DEV_METADATA_SYNC_FAULT_MESSAGE =
  'e2e metadata fault: projects' as const;

/** Honest label: injected at FluentAPI.getUserProjects seam — not a real network failure. */
export const DEV_METADATA_SYNC_TRANSPORT_FAULT_MESSAGE =
  'Network request failed (E2E injected projects transport)' as const;

export type MetadataFaultGateDeps = {
  isDev: () => boolean;
  isE2eModeEnabled: () => boolean;
  getApiBaseUrl: () => string;
  getActiveUserId: () => string;
  getFaultStepEnv: () => string | undefined;
  isSourceAudioFaultEnvRequested: () => boolean;
};

type ArmedState = {
  step: MetadataFaultStep;
  /** Failures still required before operation may complete. */
  failsRemaining: number;
};

let armed: ArmedState | null = null;

function defaultGateDeps(): MetadataFaultGateDeps {
  return {
    isDev: () => Boolean((globalThis as { __DEV__?: boolean }).__DEV__),
    isE2eModeEnabled,
    getApiBaseUrl,
    getActiveUserId,
    getFaultStepEnv: () => process.env.EXPO_PUBLIC_E2E_METADATA_FAULT_STEP,
    isSourceAudioFaultEnvRequested: isSourceAudioFaultEnvRequestedLocal,
  };
}

/** Exact QA host over https — no arbitrary subdomains. */
function isExactQaHttpsApiBase(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === REQUIRED_QA_API_HOST
    );
  } catch {
    return false;
  }
}

function isEnvFlagOn(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function parseMetadataFaultStep(
  raw: string | undefined,
): MetadataFaultStep | null {
  const step = raw?.trim().toLowerCase();
  if (step === METADATA_FAULT_STEP_PROJECTS) {
    return METADATA_FAULT_STEP_PROJECTS;
  }
  if (step === METADATA_FAULT_STEP_PROJECTS_TRANSPORT) {
    return METADATA_FAULT_STEP_PROJECTS_TRANSPORT;
  }
  return null;
}

export type FaultStartupTransferGuardDeps = {
  isDev: () => boolean;
  isE2eModeEnabled: () => boolean;
  getApiBaseUrl: () => string;
  getMetadataFaultStepEnv: () => string | undefined;
  getSourceAudioFaultEnv: () => string | undefined;
  getTransferGuardEnv: () => string | undefined;
};

function defaultTransferGuardDeps(): FaultStartupTransferGuardDeps {
  return {
    isDev: () => Boolean((globalThis as { __DEV__?: boolean }).__DEV__),
    isE2eModeEnabled,
    getApiBaseUrl,
    getMetadataFaultStepEnv: () => process.env.EXPO_PUBLIC_E2E_METADATA_FAULT_STEP,
    getSourceAudioFaultEnv: () => process.env.EXPO_PUBLIC_E2E_SOURCE_AUDIO_FAULT,
    getTransferGuardEnv: () => process.env.EXPO_PUBLIC_E2E_FAULT_TRANSFER_GUARD,
  };
}

/**
 * DEV+E2E+exact-https-QA startup transfer guard for fault / recovery sessions.
 *
 * Default off. Enabled when a Case S/A-src fault env is set OR
 * `EXPO_PUBLIC_E2E_FAULT_TRANSFER_GUARD=1` (fault-off recovery without transfers).
 * Does not check active user — fault pins remain on their own seams.
 * Pure predicate: does not mutate queues, pause prefs, claims, or blobs.
 */
export function isFaultStartupTransferGuardEnabled(
  deps: FaultStartupTransferGuardDeps = defaultTransferGuardDeps(),
): boolean {
  if (!deps.isDev()) return false;
  if (!deps.isE2eModeEnabled()) return false;
  if (!isExactQaHttpsApiBase(deps.getApiBaseUrl())) return false;

  const faultEnvRequested =
    Boolean(deps.getMetadataFaultStepEnv()?.trim()) ||
    isEnvFlagOn(deps.getSourceAudioFaultEnv());
  const guardOptIn = isEnvFlagOn(deps.getTransferGuardEnv());
  return faultEnvRequested || guardOptIn;
}

export type ArmMetadataFaultResult =
  | { armed: true; step: MetadataFaultStep; failsRemaining: number }
  | {
      armed: false;
      reason:
        | 'not_dev'
        | 'e2e_mode_off'
        | 'api_not_qa'
        | 'active_user_not_12'
        | 'step_not_requested'
        | 'unsupported_step'
        | 'source_fault_env_active'
        | 'already_armed';
    };

/**
 * Arm only from DEV metadata-control invocation. Env alone does nothing until this runs.
 * `maxAttempts` must match sync.ts MAX_SYNC_ATTEMPTS for the projects operation.
 */
export function armProjectsFaultForMetadataControlRun(
  maxAttempts: number,
  deps: MetadataFaultGateDeps = defaultGateDeps(),
): ArmMetadataFaultResult {
  if (!deps.isDev()) return { armed: false, reason: 'not_dev' };
  if (!deps.isE2eModeEnabled()) return { armed: false, reason: 'e2e_mode_off' };
  if (!isExactQaHttpsApiBase(deps.getApiBaseUrl())) {
    return { armed: false, reason: 'api_not_qa' };
  }
  if (deps.getActiveUserId() !== REQUIRED_ACTIVE_USER_ID) {
    return { armed: false, reason: 'active_user_not_12' };
  }
  if (deps.isSourceAudioFaultEnvRequested()) {
    return { armed: false, reason: 'source_fault_env_active' };
  }
  const rawStep = deps.getFaultStepEnv()?.trim();
  if (!rawStep) return { armed: false, reason: 'step_not_requested' };
  const step = parseMetadataFaultStep(rawStep);
  if (!step) {
    return { armed: false, reason: 'unsupported_step' };
  }
  if (armed) return { armed: false, reason: 'already_armed' };

  const failsRemaining = Math.max(1, maxAttempts);
  armed = { step, failsRemaining };
  return {
    armed: true,
    step,
    failsRemaining,
  };
}

export function isProjectsMetadataFaultArmed(): boolean {
  return armed != null;
}

/**
 * Called at the start of each syncProjects retrySyncStep attempt while armed
 * for non-transport `projects`. Throws a plain non-transport Error so
 * production retrySyncStep owns retries and setSyncError(sync_error_projects).
 * No-op for `projects_transport` (that mode rejects at the API-call seam).
 */
export function throwIfProjectsMetadataFaultArmed(): void {
  if (!armed || armed.step !== METADATA_FAULT_STEP_PROJECTS) {
    return;
  }
  if (armed.failsRemaining <= 0) {
    return;
  }
  armed = {
    ...armed,
    failsRemaining: armed.failsRemaining - 1,
  };
  throw new Error(DEV_METADATA_SYNC_FAULT_MESSAGE);
}

function transportFaultCallTimeGatesPass(
  deps: MetadataFaultGateDeps,
): boolean {
  if (!deps.isDev()) return false;
  if (!deps.isE2eModeEnabled()) return false;
  if (!isExactQaHttpsApiBase(deps.getApiBaseUrl())) return false;
  if (deps.getActiveUserId() !== REQUIRED_ACTIVE_USER_ID) return false;
  if (deps.isSourceAudioFaultEnvRequested()) return false;
  return (
    parseMetadataFaultStep(deps.getFaultStepEnv()) ===
    METADATA_FAULT_STEP_PROJECTS_TRANSPORT
  );
}

/**
 * Wrap the existing FluentAPI.getUserProjects thunk at the syncProjects call
 * site. Default / unarmed / wrong identity → delegates exactly once.
 * Armed `projects_transport` → reject before HTTP with ApiError(0); counts
 * toward production retrySyncStep attempts. Not a real network/DNS failure.
 */
export async function getUserProjectsWithDevMetadataTransportFault<T>(
  request: () => Promise<T>,
  deps: MetadataFaultGateDeps = defaultGateDeps(),
): Promise<T> {
  if (
    !armed ||
    armed.step !== METADATA_FAULT_STEP_PROJECTS_TRANSPORT ||
    armed.failsRemaining <= 0
  ) {
    return request();
  }

  // Call-time identity: account switch / env flip / source mutual exclusion.
  if (!transportFaultCallTimeGatesPass(deps)) {
    return request();
  }

  armed = {
    ...armed,
    failsRemaining: armed.failsRemaining - 1,
  };
  throw new ApiError(0, DEV_METADATA_SYNC_TRANSPORT_FAULT_MESSAGE);
}

/**
 * After syncProjects retry sequence finishes (exhausted or otherwise), disarm
 * so later runs / ordinary full sync cannot keep failing.
 */
export function disarmProjectsMetadataFault(): void {
  armed = null;
}

/** Test / capability helper — not a product surface. */
export function getMetadataFaultArmStateForTests(): ArmedState | null {
  return armed;
}

/** Test reset. */
export function resetMetadataFaultForTests(): void {
  armed = null;
}
