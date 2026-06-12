import { Storage } from '@op-engineering/op-sqlite';
import { logger } from '../utils/logger';

const log = logger.create('KVStorage');

export const kvStorage = new Storage({ location: 'kv' });

export const KV_KEYS = {
  USER_ID: 'userId',
  USER_EMAIL: 'userEmail',
  ACTIVE_USER_ID: 'active_user_id',
  KNOWN_USER_IDS: 'known_user_ids',
  LAST_ASSIGNMENT_SYNC_AT: 'last_assignment_sync_at',
  LAST_SYNCED_AT: 'last_synced_at',
  SYNC_COUNT_PROJECTS: 'sync_count_projects',
  SYNC_COUNT_CHAPTERS: 'sync_count_chapters',
  SYNC_COUNT_BIBLES: 'sync_count_bibles',
  SYNC_ERROR_USER: 'sync_error_user',
  SYNC_ERROR_MASTER_DATA: 'sync_error_master_data',
  SYNC_ERROR_PROJECTS: 'sync_error_projects',
  SYNC_ERROR_CHAPTER_ASSIGNMENTS: 'sync_error_chapter_assignments',
  SYNC_ERROR_PROJECT_UNITS: 'sync_error_project_units',
  SYNC_ERROR_BIBLE_TEXTS: 'sync_error_bible_texts',
} as const;

export function clearUserSession() {
  kvStorage.removeItemSync(KV_KEYS.USER_ID);
  kvStorage.removeItemSync(KV_KEYS.USER_EMAIL);
  log.info('User session cleared from KV');
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

export function setSyncError(
  key: (typeof KV_KEYS)[keyof typeof KV_KEYS],
  errorMessage: string,
) {
  kvStorage.setItemSync(key, errorMessage);
  log.info('Sync error stored', { key, errorMessage });
}

export function getSyncError(
  key: (typeof KV_KEYS)[keyof typeof KV_KEYS],
): string | undefined {
  return kvStorage.getItemSync(key);
}

export function clearSyncError(key: (typeof KV_KEYS)[keyof typeof KV_KEYS]) {
  kvStorage.removeItemSync(key);
  log.info('Sync error cleared', { key });
}

export function clearAllSyncErrors() {
  clearSyncError(KV_KEYS.SYNC_ERROR_USER);
  clearSyncError(KV_KEYS.SYNC_ERROR_MASTER_DATA);
  clearSyncError(KV_KEYS.SYNC_ERROR_PROJECTS);
  clearSyncError(KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS);
  clearSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS);
  clearSyncError(KV_KEYS.SYNC_ERROR_BIBLE_TEXTS);
  log.info('All sync errors cleared');
}

export type SyncState = {
  lastSyncedAt: string;
  projectsCount: number;
  chaptersCount: number;
  biblesCount: number;
};

export function getSyncState(): SyncState {
  return {
    lastSyncedAt: getLastSyncedAt(),
    projectsCount: getSyncCount(KV_KEYS.SYNC_COUNT_PROJECTS),
    chaptersCount: getSyncCount(KV_KEYS.SYNC_COUNT_CHAPTERS),
    biblesCount: getSyncCount(KV_KEYS.SYNC_COUNT_BIBLES),
  };
}

export function getActiveUserId(): string {
  return kvStorage.getItemSync(KV_KEYS.ACTIVE_USER_ID) ?? '';
}

export function setActiveUserId(userId: string) {
  kvStorage.setItemSync(KV_KEYS.ACTIVE_USER_ID, userId);
}

export function getKnownUserIds(): string[] {
  const raw = kvStorage.getItemSync(KV_KEYS.KNOWN_USER_IDS) ?? '';
  return raw ? raw.split(',').filter(Boolean) : [];
}

export function addKnownUserId(userId: string) {
  const existing = getKnownUserIds();
  if (!existing.includes(userId)) {
    existing.push(userId);
    kvStorage.setItemSync(KV_KEYS.KNOWN_USER_IDS, existing.join(','));
  }
}

export function getUserEmail(userId: string): string {
  return kvStorage.getItemSync(`${userId}:email`) ?? '';
}

export function setUserEmail(userId: string, email: string) {
  kvStorage.setItemSync(`${userId}:email`, email);
}

export function getUserIdSync(): string {
  return getActiveUserId();
}

export function getUserEmailSync(): string {
  const activeUserId = getActiveUserId();
  if (activeUserId) {
    const email = getUserEmail(activeUserId);
    if (email) return email;
  }
  // Fall back to legacy key — set during login before syncUser runs
  return kvStorage.getItemSync(KV_KEYS.USER_EMAIL) ?? '';
}

export function setUserSync(userId: string, userEmail: string) {
  kvStorage.setItemSync(KV_KEYS.USER_ID, userId);
  kvStorage.setItemSync(KV_KEYS.USER_EMAIL, userEmail);
  setActiveUserId(userId);
  addKnownUserId(userId);
  setUserEmail(userId, userEmail);
  log.info('User stored in KV', { userId, userEmail });
}

export function switchActiveUser(userId: string) {
  setActiveUserId(userId);
  kvStorage.setItemSync(KV_KEYS.USER_ID, userId);
  kvStorage.setItemSync(KV_KEYS.USER_EMAIL, getUserEmail(userId));
  log.info('Switched active user', { userId });
}

export function getLastAssignmentSyncAt(): string {
  return kvStorage.getItemSync(KV_KEYS.LAST_ASSIGNMENT_SYNC_AT) ?? '';
}

export function setLastAssignmentSyncAt(timestamp: string) {
  kvStorage.setItemSync(KV_KEYS.LAST_ASSIGNMENT_SYNC_AT, timestamp);
  log.info('Last assignment sync timestamp updated', { timestamp });
}

export function getUserLastSyncedAt(userId: string): string {
  return kvStorage.getItemSync(`${userId}:last_synced_at`) ?? '';
}

export function setUserLastSyncedAt(userId: string, timestamp: string) {
  kvStorage.setItemSync(`${userId}:last_synced_at`, timestamp);
  log.info('Per-user last synced timestamp updated', { userId, timestamp });
}
