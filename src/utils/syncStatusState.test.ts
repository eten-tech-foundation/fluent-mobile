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

  it('returns online_needs_sync when online with incomplete local download data', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: false,
        needsDownloadSync: true,
      }),
    ).toBe('online_needs_sync');
  });

  it('prefers online_syncing over online_needs_sync when actively syncing', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: true,
        hasPendingUploads: false,
        needsDownloadSync: true,
      }),
    ).toBe('online_syncing');
  });

  it('prefers online_pending over online_needs_sync when uploads are queued', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: true,
        needsDownloadSync: true,
      }),
    ).toBe('online_pending');
  });

  it('returns offline_synced when offline even if download sync is needed', () => {
    expect(
      deriveSyncStatus({
        isOnline: false,
        isSyncing: false,
        hasPendingUploads: false,
        needsDownloadSync: true,
      }),
    ).toBe('offline_synced');
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
