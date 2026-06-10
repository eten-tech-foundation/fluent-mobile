import { useState, useEffect, useCallback } from 'react';
import { syncAllData } from '../services/sync';
import { getSyncState, getSyncError, KV_KEYS } from '../services/storage';
import { logger } from '../utils/logger';

const log = logger.create('useSync');

export type SyncStateType = 'normal' | 'syncing' | 'never' | 'error';

const SYNC_ERROR_STEPS = [
  { key: KV_KEYS.SYNC_ERROR_USER, label: 'user' },
  { key: KV_KEYS.SYNC_ERROR_MASTER_DATA, label: 'master data' },
  { key: KV_KEYS.SYNC_ERROR_PROJECTS, label: 'projects' },
  { key: KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS, label: 'chapter assignments' },
  { key: KV_KEYS.SYNC_ERROR_PROJECT_UNITS, label: 'project units' },
  { key: KV_KEYS.SYNC_ERROR_BIBLE_TEXTS, label: 'bible texts' },
] as const;

function getRelativeTime(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return 'Never synced';

  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function getFailedStep(): string | null {
  for (const { key, label } of SYNC_ERROR_STEPS) {
    if (getSyncError(key)) return label;
  }
  return null;
}

function buildDisplayText(isSyncing: boolean): {
  stateType: SyncStateType;
  displayText: string;
} {
  if (isSyncing) {
    return { stateType: 'syncing', displayText: 'Syncing...' };
  }

  const failedStep = getFailedStep();
  if (failedStep) {
    return {
      stateType: 'error',
      displayText: `Sync failed: ${failedStep}`,
    };
  }

  const { lastSyncedAt } = getSyncState();
  if (!lastSyncedAt) {
    return { stateType: 'never', displayText: 'Never synced' };
  }

  return {
    stateType: 'normal',
    displayText: `Last synced: ${getRelativeTime(lastSyncedAt)}`,
  };
}

interface UseSyncOptions {
  onSyncComplete?: () => void;
  onSyncStart?: () => void;
}

export function useSync({ onSyncComplete, onSyncStart }: UseSyncOptions = {}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [{ stateType, displayText }, setSyncDisplay] = useState(() =>
    buildDisplayText(false),
  );

  const updateState = useCallback((syncing: boolean) => {
    setSyncDisplay(buildDisplayText(syncing));
  }, []);

  useEffect(() => {
    updateState(isSyncing);
  }, [isSyncing, updateState]);

  useEffect(() => {
    if (stateType !== 'normal') return;

    const interval = setInterval(() => updateState(false), 60_000);
    return () => clearInterval(interval);
  }, [stateType, updateState]);

  const triggerSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      onSyncStart?.();

      log.info('Triggering sync...');
      await syncAllData(true);
      log.info('Sync completed successfully');
      onSyncComplete?.();
    } catch (error) {
      log.error('Sync failed', { error });
    } finally {
      setIsSyncing(false);
      updateState(false);
    }
  }, [onSyncStart, onSyncComplete, updateState]);

  return {
    stateType,
    displayText,
    isSyncing,
    triggerSync,
  };
}
