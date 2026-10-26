/**
 * Shared gate for DEV + E2E Maestro hold flags (upload / download auto-resume).
 * Never enable on production / preview / nightly EAS profiles. Default off.
 */

import { getApiBaseUrl } from './apiBaseUrl';
import { isE2eModeEnabled, isEnvFlagOn } from './e2eMode';

const REQUIRED_QA_API_HOST = 'qa.api.fluent.bible';

export type E2eQaHoldGateDeps = {
  isDev: () => boolean;
  isE2eModeEnabled: () => boolean;
  getApiBaseUrl: () => string;
};

const defaultDeps: E2eQaHoldGateDeps = {
  isDev: () => __DEV__,
  isE2eModeEnabled,
  getApiBaseUrl,
};

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
 * Pure predicate: true only when __DEV__, E2E mode, the hold flag ('1'/'true'),
 * and an exact https QA API base are all present. Missing API base → false.
 */
export function isE2eQaHoldGateOpen(
  holdFlag: string | undefined,
  deps: E2eQaHoldGateDeps = defaultDeps,
): boolean {
  if (!deps.isDev() || !deps.isE2eModeEnabled() || !isEnvFlagOn(holdFlag)) {
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
