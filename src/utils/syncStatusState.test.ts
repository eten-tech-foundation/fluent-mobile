import { deriveSyncStatus, formatSyncStatusLabel } from './syncStatusState';

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

  it('returns online_uploading when online and the upload worker is active', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: true,
        isUploading: true,
      }),
    ).toBe('online_uploading');
  });

  it('prefers online_syncing over online_uploading', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: true,
        hasPendingUploads: true,
        isUploading: true,
      }),
    ).toBe('online_syncing');
  });

  it('returns online_failed when online with failed uploads and not uploading', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: true,
        hasFailedUploads: true,
      }),
    ).toBe('online_failed');
  });

  it('prefers online_uploading over online_failed', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: true,
        isUploading: true,
        hasFailedUploads: true,
      }),
    ).toBe('online_uploading');
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

  it('prefers online_failed over online_needs_sync', () => {
    expect(
      deriveSyncStatus({
        isOnline: true,
        isSyncing: false,
        hasPendingUploads: false,
        hasFailedUploads: true,
        needsDownloadSync: true,
      }),
    ).toBe('online_failed');
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

  it('returns offline_pending when offline with failed uploads', () => {
    expect(
      deriveSyncStatus({
        isOnline: false,
        isSyncing: false,
        hasPendingUploads: false,
        hasFailedUploads: true,
      }),
    ).toBe('offline_pending');
  });
});

describe('formatSyncStatusLabel', () => {
  it('includes upload progress counts for online_uploading', () => {
    expect(
      formatSyncStatusLabel('online_uploading', {
        completed: 2,
        total: 5,
      }),
    ).toBe('Uploading 2 of 5. Open Sync page.');
  });

  it('includes failed counts for online_failed', () => {
    expect(formatSyncStatusLabel('online_failed', { failedCount: 1 })).toBe(
      '1 upload failed. Open Sync page to retry.',
    );
    expect(formatSyncStatusLabel('online_failed', { failedCount: 3 })).toBe(
      '3 uploads failed. Open Sync page to retry.',
    );
  });
});
