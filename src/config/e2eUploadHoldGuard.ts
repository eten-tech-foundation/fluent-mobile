/**
 * DEV + E2E opt-in: leave the upload orchestrator stopped (no auto initiation).
 *
 * Independent of the download auto-resume hold. Does not clear upload queues,
 * takes, pause prefs, or claims, and does not block metadata sync.
 */

import { isE2eQaHoldGateOpen } from './e2eQaHoldGate';

export function isE2eUploadHoldEnabled(): boolean {
  // Literal dot access so Expo inlines the EXPO_PUBLIC_ value at build time.
  return isE2eQaHoldGateOpen(process.env.EXPO_PUBLIC_E2E_HOLD_UPLOADS);
}
