import { useState, useEffect, useCallback } from 'react';
import { syncAllUsers } from '../services/sync';
import { getSyncState } from '../services/storage';
import {
  onSyncComplete as subscribeSyncComplete,
  onUploadSessionEvent,
} from '../services/syncEvents';
import { getFailedMetadataSyncStepLabels } from '../utils/metadataSyncErrors';
import { logger } from '../utils/logger';

const log = logger.create('useSync');

export type SyncStateType = 'normal' | 'syncing' | 'never' | 'error';

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

function buildDisplayText(isSyncing: boolean): {
  stateType: SyncStateType;
  displayText: string;
} {
  if (isSyncing) {
    return { stateType: 'syncing', displayText: 'Syncing...' };
  }

  const failedSteps = getFailedMetadataSyncStepLabels();
  if (failedSteps.length > 0) {
    return {
      stateType: 'error',
      displayText: `Sync failed: ${failedSteps.join(', ')}`,
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
  onError?: (error: unknown) => void;
}

export function useSync({
  onSyncComplete,
  onSyncStart,
  onError,
}: UseSyncOptions = {}) {
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
    const unsubscribeComplete = subscribeSyncComplete(() => {
      updateState(isSyncing);
    });
    const unsubscribeUpload = onUploadSessionEvent(event => {
      if (
        event.type === 'complete' ||
        event.type === 'idle' ||
        event.type === 'paused'
      ) {
        updateState(isSyncing);
      }
    });
    return () => {
      unsubscribeComplete();
      unsubscribeUpload();
    };
  }, [isSyncing, updateState]);

  useEffect(() => {
    if (isSyncing) return;

    const interval = setInterval(() => updateState(false), 60_000);
    return () => clearInterval(interval);
  }, [isSyncing, updateState]);

  const triggerSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      onSyncStart?.();

      log.info('Triggering sync...');
      await syncAllUsers();
      log.info('Sync completed successfully');
      onSyncComplete?.();
    } catch (error) {
      log.error('Sync failed', { error });
      onError?.(error);
    } finally {
      setIsSyncing(false);
      updateState(false);
    }
  }, [onSyncStart, onSyncComplete, onError, updateState]);

  return {
    stateType,
    displayText,
    isSyncing,
    triggerSync,
  };
}
