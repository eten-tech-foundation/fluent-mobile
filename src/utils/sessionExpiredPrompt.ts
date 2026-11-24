/**
 * When a quiet 401 should become a Home banner.
 * Offline never prompts. Online prompts only when work is waiting to sync
 * or the user has opened Sync during this reauth.
 */
export function shouldShowSessionExpiredBanner(input: {
  reauthRequired: boolean;
  isOnline: boolean;
  hasPendingSyncWork: boolean;
  syncOpened: boolean;
}): boolean {
  return (
    input.reauthRequired &&
    input.isOnline &&
    (input.hasPendingSyncWork || input.syncOpened)
  );
}

/** Spoken cloud label while a sign-in is needed before the next sync. */
export function signInToSyncAccessibilityLabel(input: {
  reauthRequired: boolean;
  isOnline: boolean;
}): string | null {
  if (!input.reauthRequired || !input.isOnline) return null;
  return 'Sign in to sync';
}
