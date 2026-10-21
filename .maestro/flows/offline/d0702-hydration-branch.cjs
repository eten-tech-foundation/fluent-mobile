/**
 * D-0702 hydration terminal classifier (device-free).
 * Used by static tests to gate available / unavailable / loading / mixed states.
 * Runtime Maestro YAML selects branches via visible oracles; this encodes the
 * same semantics so loading or arbitrary errors cannot silently PASS.
 *
 * @typedef {object} HydrationSignals
 * @property {boolean} loadingVisible
 * @property {boolean} unavailableVisible
 * @property {boolean} resourcesSectionVisible
 * @property {boolean} footerHintVisible
 * @property {boolean} downloadEnabled
 * @property {string} totalBytesText
 * @property {string} downloadLabel
 */

'use strict';

const UNAVAILABLE_MESSAGE =
  "Couldn't load downloadable resources for the selected chapters. Check your connection and try again.";

const POSITIVE_SIZE_RE = /^(?!0 B$)\d+(\.\d+)? (B|KB|MB|GB)$/;
const POSITIVE_DOWNLOAD_RE = /^Download (?!0 B$).+$/;

/**
 * @param {HydrationSignals} signals
 * @returns {{ ok: boolean, branch?: 'available'|'unavailable', reason: string }}
 */
function classifyHydrationTerminal(signals) {
  const {
    loadingVisible,
    unavailableVisible,
    resourcesSectionVisible,
    footerHintVisible,
    downloadEnabled,
    totalBytesText,
    downloadLabel,
  } = signals;

  if (loadingVisible) {
    return { ok: false, reason: 'still-loading' };
  }

  if (unavailableVisible && resourcesSectionVisible) {
    return { ok: false, reason: 'mixed-available-and-unavailable' };
  }

  if (unavailableVisible) {
    if (downloadEnabled) {
      return { ok: false, reason: 'unavailable-but-download-enabled' };
    }
    if (totalBytesText !== '0 B') {
      return { ok: false, reason: 'unavailable-nonzero-total' };
    }
    if (downloadLabel !== 'Download 0 B') {
      return { ok: false, reason: 'unavailable-nonzero-download-label' };
    }
    if (!footerHintVisible) {
      return { ok: false, reason: 'unavailable-missing-footer-hint' };
    }
    return { ok: true, branch: 'unavailable', reason: 'unavailable' };
  }

  if (resourcesSectionVisible) {
    if (!downloadEnabled) {
      return { ok: false, reason: 'available-but-download-disabled' };
    }
    if (!POSITIVE_SIZE_RE.test(totalBytesText || '')) {
      return { ok: false, reason: 'available-nonpositive-total' };
    }
    if (!POSITIVE_DOWNLOAD_RE.test(downloadLabel || '')) {
      return { ok: false, reason: 'available-nonpositive-download-label' };
    }
    if (footerHintVisible) {
      return { ok: false, reason: 'available-with-footer-hint' };
    }
    return { ok: true, branch: 'available', reason: 'available' };
  }

  // Disabled Download alone (loading / settling) is not a terminal PASS.
  if (!downloadEnabled && (totalBytesText === '0 B' || downloadLabel === 'Download 0 B')) {
    return { ok: false, reason: 'disabled-transient-not-terminal' };
  }

  return { ok: false, reason: 'no-terminal' };
}

module.exports = {
  UNAVAILABLE_MESSAGE,
  POSITIVE_SIZE_RE,
  POSITIVE_DOWNLOAD_RE,
  classifyHydrationTerminal,
};
