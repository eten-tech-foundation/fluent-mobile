/**
 * DEV + E2E opt-in: skip Auth download-queue auto-resume only.
 *
 * Keeps queued offline downloads idle during Maestro sessions without
 * suppressing upload orchestrator startup or sync/metadata orchestration.
 */

import { isE2eQaHoldGateOpen } from './e2eQaHoldGate';

export function isE2eDownloadAutoResumeHoldEnabled(): boolean {
  // Literal dot access so Expo inlines the EXPO_PUBLIC_ value at build time.
  return isE2eQaHoldGateOpen(
    process.env.EXPO_PUBLIC_E2E_HOLD_DOWNLOAD_AUTO_RESUME,
  );
}
