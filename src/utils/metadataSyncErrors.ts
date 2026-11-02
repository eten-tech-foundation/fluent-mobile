import { getSyncError, KV_KEYS } from '../services/storage';

/**
 * Metadata sync steps whose persisted `sync_error_*` KV keys surface as Sync
 * page `stateType: 'error'` (PR #472) and Home `online_needs_sync`.
 * Keep this list shared so useSync and Home status cannot drift.
 */
export const METADATA_SYNC_ERROR_STEPS = [
  { key: KV_KEYS.SYNC_ERROR_USER, label: 'user' },
  { key: KV_KEYS.SYNC_ERROR_MASTER_DATA, label: 'master data' },
  { key: KV_KEYS.SYNC_ERROR_PROJECTS, label: 'projects' },
  { key: KV_KEYS.SYNC_ERROR_CHAPTER_CLAIMS, label: 'chapter claims' },
  { key: KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS, label: 'chapter assignments' },
  { key: KV_KEYS.SYNC_ERROR_PROJECT_UNITS, label: 'project units' },
  { key: KV_KEYS.SYNC_ERROR_BIBLE_TEXTS, label: 'bible texts' },
  { key: KV_KEYS.SYNC_ERROR_PERICOPE_SETS, label: 'pericope sets' },
  { key: KV_KEYS.SYNC_ERROR_PERICOPES, label: 'pericopes' },
] as const;

/** Labels of metadata steps with a persisted sync_error_* value. */
export function getFailedMetadataSyncStepLabels(): string[] {
  const failed: string[] = [];
  for (const { key, label } of METADATA_SYNC_ERROR_STEPS) {
    if (getSyncError(key)) failed.push(label);
  }
  return failed;
}

/** True when any PR #472 metadata sync_error_* KV key is set. */
export function hasPersistedMetadataSyncErrors(): boolean {
  return getFailedMetadataSyncStepLabels().length > 0;
}
