import { Storage } from '@op-engineering/op-sqlite';
import { logger } from '../utils/logger';

const log = logger.create('KVStorage');

export const kvStorage = new Storage({
  location: 'kv',
});

export const KV_KEYS = {
  USER_ID: 'userId',
  USER_EMAIL: 'userEmail',
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
