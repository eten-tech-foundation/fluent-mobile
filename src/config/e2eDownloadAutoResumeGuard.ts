/**
 * DEV + E2E opt-in: skip Auth *download-queue* auto-resume only.
 *
 * Keeps queued offline downloads idle during QA upload / login sessions without
 * suppressing upload orchestrator startup or sync/metadata orchestration.
 * Default off. Distinct from the coupled FAULT_TRANSFER guard (upload+download)
 * used in temporary fault worktrees — do not conflate the two.
 *
 * Never enable on production / preview / nightly EAS profiles.
 */

import { getApiBaseUrl } from './apiBaseUrl';
import { isE2eModeEnabled } from './e2eMode';

/** Opt-in env — must be set with EXPO_PUBLIC_E2E_MODE under __DEV__ + exact QA API. */
export const ENV_E2E_HOLD_DOWNLOAD_AUTO_RESUME =
  'EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME';

export const REQUIRED_QA_API_HOST = 'qa.api.fluent.bible';

export type E2eDownloadAutoResumeGuardDeps = {
  isDev: () => boolean;
  isE2eModeEnabled: () => boolean;
  getApiBaseUrl: () => string;
  getHoldEnv: () => string | undefined;
};

function defaultDeps(): E2eDownloadAutoResumeGuardDeps {
  return {
    isDev: () => Boolean((globalThis as { __DEV__?: boolean }).__DEV__),
    isE2eModeEnabled,
    getApiBaseUrl,
    getHoldEnv: () => process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME,
  };
}

function isEnvFlagOn(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
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

/**
 * Pure predicate: does not mutate queues, pause prefs, claims, or blobs.
 * Safe default false when any gate is off or API base is missing/non-QA.
 */
export function isE2eDownloadAutoResumeHoldEnabled(
  deps: E2eDownloadAutoResumeGuardDeps = defaultDeps(),
): boolean {
  if (!deps.isDev()) {
    return false;
  }
  if (!deps.isE2eModeEnabled()) {
    return false;
  }
  if (!isEnvFlagOn(deps.getHoldEnv())) {
    return false;
  }

  let apiBase: string;
  try {
    apiBase = deps.getApiBaseUrl();
  } catch {
    return false;
  }

  return isExactQaHttpsApiBase(apiBase);
}
