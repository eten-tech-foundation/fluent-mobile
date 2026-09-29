import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { getPendingUploadCount } from '../db/queries';
import {
  getSyncStatusSnapshot,
  refreshSyncStatusStore,
  subscribeToSyncStatusStore,
} from '../services/syncStatusStore';
import type { SyncStatusSnapshot } from '../services/syncStatusStore';
import { logger } from '../utils/logger';

const log = logger.create('usePendingUploads');

export type { UploadProgress } from '../services/syncStatusStore';

/** One-shot pending upload count for UI (logout gates, sync completion). */
export async function loadPendingUploadCount(): Promise<number> {
  try {
    return await getPendingUploadCount();
  } catch (error) {
    log.error('Failed to load pending upload count', { error });
    return 0;
  }
}

export function usePendingUploads(refreshKey = 0): SyncStatusSnapshot & {
  hasPendingUploads: boolean;
  hasFailedUploads: boolean;
  hasUnuploadablePending: boolean;
} {
  // Shared store (#530): every consumer — Home, chapter screen, ViewProject,
  // Sync page — reads the same snapshot, so headers can never disagree.
  const snapshot = useSyncExternalStore(
    subscribeToSyncStatusStore,
    getSyncStatusSnapshot,
  );

  const refresh = useCallback(() => {
    void refreshSyncStatusStore();
  }, []);

  // Refresh when a screen regains focus (returning from Sync, tab switch).
  useFocusEffect(refresh);

  // Refresh on mount and whenever the parent bumps refreshKey (sync complete,
  // user switch — counts are active-user scoped so a switch must re-read).
  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return {
    pendingCount: snapshot.pendingCount,
    pendingChapterCount: snapshot.pendingChapterCount,
    failedCount: snapshot.failedCount,
    unuploadableCount: snapshot.unuploadableCount,
    failedErrorText: snapshot.failedErrorText,
    hasPendingUploads: snapshot.pendingCount > 0,
    hasFailedUploads: snapshot.failedCount > 0,
    hasUnuploadablePending: snapshot.unuploadableCount > 0,
    isUploading: snapshot.isUploading,
    uploadProgress: snapshot.uploadProgress,
  };
}
