import { Storage } from '@op-engineering/op-sqlite';
import { logger } from '../utils/logger';

const log = logger.create('KVStorage');

export const kvStorage = new Storage({
  location: 'kv',
});

export const KV_KEYS = {
  USER_ID: 'userId',
  USER_EMAIL: 'userEmail',

  LAST_SYNCED_AT: 'last_synced_at',
  SYNC_COUNT_PROJECTS: 'sync_count_projects',
  SYNC_COUNT_CHAPTERS: 'sync_count_chapters',
  SYNC_COUNT_BIBLES: 'sync_count_bibles',
} as const;

export function getUserIdSync(): string {
  return kvStorage.getItemSync(KV_KEYS.USER_ID) ?? '';
}

export function getUserEmailSync(): string {
  return kvStorage.getItemSync(KV_KEYS.USER_EMAIL) ?? '';
}

export function setUserSync(userId: string, userEmail: string) {
  kvStorage.setItemSync(KV_KEYS.USER_ID, userId);
  kvStorage.setItemSync(KV_KEYS.USER_EMAIL, userEmail);
  log.info('User stored in KV', { userId, userEmail });
}

export function getLastSyncedAt(): string {
  return kvStorage.getItemSync(KV_KEYS.LAST_SYNCED_AT) ?? '';
}

export function setLastSyncedAt(timestamp: string) {
  kvStorage.setItemSync(KV_KEYS.LAST_SYNCED_AT, timestamp);
  log.info('Last synced timestamp updated', { timestamp });
}

export function getSyncCount(
  key: (typeof KV_KEYS)[keyof typeof KV_KEYS],
): number {
  const value = kvStorage.getItemSync(key);
  return value ? parseInt(value, 10) : 0;
}

export function setSyncCount(
  key: (typeof KV_KEYS)[keyof typeof KV_KEYS],
  count: number,
) {
  kvStorage.setItemSync(key, String(count));
  log.info('Sync count updated', { key, count });
}

export function getSyncState(): SyncState {
  return {
    lastSyncedAt: getLastSyncedAt(),
    projectsCount: getSyncCount(KV_KEYS.SYNC_COUNT_PROJECTS),
    chaptersCount: getSyncCount(KV_KEYS.SYNC_COUNT_CHAPTERS),
    biblesCount: getSyncCount(KV_KEYS.SYNC_COUNT_BIBLES),
  };
}

export type SyncState = {
  lastSyncedAt: string;
  projectsCount: number;
  chaptersCount: number;
  biblesCount: number;
};
