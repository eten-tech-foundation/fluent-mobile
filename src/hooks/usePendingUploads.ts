import { useEffect, useState } from 'react';
import { getPendingUploadCount } from '../db/queries';
import { logger } from '../utils/logger';

const log = logger.create('usePendingUploads');

export function usePendingUploads(refreshKey = 0) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getPendingUploadCount()
      .then(count => {
        if (!cancelled) {
          setPendingCount(count);
        }
      })
      .catch(error => {
        log.error('Failed to load pending upload count', { error });
        if (!cancelled) {
          setPendingCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { pendingCount, hasPendingUploads: pendingCount > 0 };
}
