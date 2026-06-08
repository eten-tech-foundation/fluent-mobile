import { getUserIdSync } from '../services/storage';

/** Parses the synced user id from storage, or null when missing/invalid. */
export function parseUserId(): number | null {
  const raw = getUserIdSync();
  if (!raw) {
    return null;
  }
  const userId = Number(raw);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}
