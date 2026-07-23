import { useCallback, useState } from 'react';
import { authToken } from '../services/authToken';
import {
  syncPendingRecordings,
  type UploadResult,
} from '../services/recordingSync';
import { logger } from '../utils/logger';

const log = logger.create('useRetryFailedUploads');

/**
 * Re-runs the recording upload worker for pending/failed latest takes.
 * Reflects in-flight state for Sync UI retry affordances (#101).
 */
export function useRetryFailedUploads() {
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const retryFailedUploads =
    useCallback(async (): Promise<UploadResult | null> => {
      const token = authToken.get();
      if (!token) {
        const message = 'Not signed in — cannot retry uploads';
        log.error(message);
        setLastError(message);
        return null;
      }

      setIsRetrying(true);
      setLastError(null);
      try {
        const result = await syncPendingRecordings(token);
        setLastResult(result);
        log.info('Retry upload pass finished', {
          uploaded: result.uploaded,
          failed: result.failed,
        });
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload retry failed';
        log.error('Retry upload pass failed', { error });
        setLastError(message);
        return null;
      } finally {
        setIsRetrying(false);
      }
    }, []);

  return {
    retryFailedUploads,
    isRetrying,
    lastResult,
    lastError,
  };
}
