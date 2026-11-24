import {
  shouldShowSessionExpiredBanner,
  signInToSyncAccessibilityLabel,
} from './sessionExpiredPrompt';

const quiet = {
  reauthRequired: true,
  isOnline: true,
  hasPendingSyncWork: false,
  syncOpened: false,
};

describe('sessionExpiredPrompt', () => {
  it('stays quiet while offline or when nothing is waiting to sync', () => {
    expect(shouldShowSessionExpiredBanner(quiet)).toBe(false);
    expect(
      shouldShowSessionExpiredBanner({
        ...quiet,
        isOnline: false,
        syncOpened: true,
      }),
    ).toBe(false);
    expect(
      shouldShowSessionExpiredBanner({
        ...quiet,
        isOnline: false,
        hasPendingSyncWork: true,
      }),
    ).toBe(false);
    expect(signInToSyncAccessibilityLabel({ ...quiet, isOnline: false })).toBe(
      null,
    );
  });

  it('prompts when online and work is waiting or Sync was opened', () => {
    expect(
      shouldShowSessionExpiredBanner({ ...quiet, hasPendingSyncWork: true }),
    ).toBe(true);
    expect(shouldShowSessionExpiredBanner({ ...quiet, syncOpened: true })).toBe(
      true,
    );
    expect(signInToSyncAccessibilityLabel(quiet)).toBe('Sign in to sync');
  });
});
