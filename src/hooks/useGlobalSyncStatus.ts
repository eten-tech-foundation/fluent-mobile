import { useState, useEffect, useCallback } from 'react';
import { onSyncStart, onSyncComplete } from '../services/syncEvents';

export function useGlobalSyncStatus(onComplete?: () => void) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleComplete = useCallback(() => {
    setIsSyncing(false);
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    const unsubStart = onSyncStart(() => setIsSyncing(true));
    const unsubComplete = onSyncComplete(handleComplete);
    return () => {
      unsubStart();
      unsubComplete();
    };
  }, [handleComplete]);

  return isSyncing;
}
