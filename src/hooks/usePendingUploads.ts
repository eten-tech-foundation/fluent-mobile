import { useEffect, useState } from 'react';
import { getPendingUploadCount } from '../db/queries';
import { logger } from '../utils/logger';

const log = logger.create('usePendingUploads');

/** One-shot pending upload count for UI (logout gates, sync completion). */
export async function loadPendingUploadCount(): Promise<number> {
  try {
    return await getPendingUploadCount();
  } catch (error) {
    log.error('Failed to load pending upload count', { error });
    return 0;
  }
}

export function usePendingUploads(refreshKey = 0) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    loadPendingUploadCount()
      .then(count => {
        if (!cancelled) {
          setPendingCount(count);
        }
      })
      .catch(() => {
        // loadPendingUploadCount already logs and returns 0
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { pendingCount, hasPendingUploads: pendingCount > 0 };
}
