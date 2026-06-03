import { useState, useEffect, useCallback } from 'react';
import { syncAllData } from '../services/sync';
import {
  getSyncState,
  getSyncError,
  KV_KEYS,
  getUserEmailSync,
} from '../services/storage';
import { logger } from '../utils/logger';

const log = logger.create('useSync');

export type SyncStateType = 'normal' | 'syncing' | 'never' | 'error';

function getRelativeTime(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return 'Never synced';

  const now = new Date();
  const syncTime = new Date(isoTimestamp);
  const diffMs = now.getTime() - syncTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function getFailedStep(): string | null {
  const userError = getSyncError(KV_KEYS.SYNC_ERROR_USER);
  if (userError) return 'user';

  const masterDataError = getSyncError(KV_KEYS.SYNC_ERROR_MASTER_DATA);
  if (masterDataError) return 'master data';

  const projectsError = getSyncError(KV_KEYS.SYNC_ERROR_PROJECTS);
  if (projectsError) return 'projects';

  const chaptersError = getSyncError(KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS);
  if (chaptersError) return 'chapter assignments';

  const projectUnitsError = getSyncError(KV_KEYS.SYNC_ERROR_PROJECT_UNITS);
  if (projectUnitsError) return 'project units';

  const bibleTextsError = getSyncError(KV_KEYS.SYNC_ERROR_BIBLE_TEXTS);
  if (bibleTextsError) return 'bible texts';

  return null;
}

interface UseSyncOptions {
  onSyncComplete?: () => void;
  onSyncStart?: () => void;
}

export function useSync({ onSyncComplete, onSyncStart }: UseSyncOptions = {}) {
  const [stateType, setStateType] = useState<SyncStateType>('normal');
  const [displayText, setDisplayText] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const updateState = useCallback(() => {
    if (isSyncing) {
      setStateType('syncing');
      setDisplayText('Syncing...');
      return;
    }

    const failedStep = getFailedStep();
    const syncState = getSyncState();

    if (failedStep) {
      setStateType('error');
      setDisplayText(`Sync failed: ${failedStep}`);
    } else if (!syncState.lastSyncedAt) {
      setStateType('never');
      setDisplayText('Never synced');
    } else {
      setStateType('normal');
      setDisplayText(`Last synced: ${getRelativeTime(syncState.lastSyncedAt)}`);
    }
  }, [isSyncing]);

  useEffect(() => {
    updateState();
  }, [isSyncing, updateState]);

  useEffect(() => {
    if (stateType === 'normal') {
      const interval = setInterval(() => {
        updateState();
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [stateType, updateState]);

  const triggerSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      onSyncStart?.();
      const email = getUserEmailSync();

      if (!email) {
        log.error('No user email found for sync');
        return;
      }

      log.info('Triggering sync...');
      await syncAllData(email);

      log.info('Sync completed successfully');
      updateState();
      onSyncComplete?.();
    } catch (error) {
      log.error('Sync failed', { error });
      updateState();
    } finally {
      setIsSyncing(false);
    }
  }, [onSyncStart, onSyncComplete, updateState]);

  return {
    stateType,
    displayText,
    isSyncing,
    triggerSync,
    updateState,
  };
}
