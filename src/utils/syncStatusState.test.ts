import { deriveSyncStatus } from './syncStatusState';

describe('deriveSyncStatus', () => {
  it('returns online_syncing when online and actively syncing', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: true,
        hasPendingUploads: false,
      }),
    ).toBe('online_syncing');

    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: true,
        hasPendingUploads: true,
      }),
    ).toBe('online_syncing');
  });

  it('returns online_pending when online with pending uploads and not syncing', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: true,
      }),
    ).toBe('online_pending');
  });

  it('returns online_synced when online with no pending uploads and not syncing', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: false,
      }),
    ).toBe('online_synced');
  });

  it('returns offline_synced when offline with no pending uploads', () => {
    expect(
      deriveSyncStatus({
        isOnline: false,
        isSyncing: false,
        hasPendingUploads: false,
      }),
    ).toBe('offline_synced');
  });

  it('returns offline_pending when offline with pending uploads', () => {
    expect(
      deriveSyncStatus({
        isOnline: false,
        isSyncing: true,
        hasPendingUploads: true,
      }),
    ).toBe('offline_pending');
  });
});
