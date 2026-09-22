import { useEffect, useState } from 'react';
import {
  getFailedUploadCount,
  getFailedUploadErrorSummary,
  getPendingUploadChapters,
  getPendingUploadCount,
} from '../db/queries';
import {
  onUploadSessionEvent,
  type UploadSessionEvent,
} from '../services/syncEvents';
import { logger } from '../utils/logger';
import { sanitizeUploadErrorForDisplay } from '../utils/sanitizeUploadError';

const log = logger.create('usePendingUploads');

export interface UploadProgress {
  completed: number;
  total: number;
}

/** One-shot pending upload count for UI (logout gates, sync completion). */
export async function loadPendingUploadCount(): Promise<number> {
  try {
    return await getPendingUploadCount();
  } catch (error) {
    log.error('Failed to load pending upload count', { error });
    return 0;
  }
}

async function loadFailedUploadCount(): Promise<number> {
  try {
    return await getFailedUploadCount();
  } catch (error) {
    log.error('Failed to load failed upload count', { error });
    return 0;
  }
}

async function loadFailedUploadErrorText(): Promise<string | null> {
  try {
    const summary = await getFailedUploadErrorSummary();
    if (!summary) {
      return null;
    }
    const sanitized = sanitizeUploadErrorForDisplay(summary.latestMessage);
    const suffix =
      summary.extraDistinctCount > 0
        ? ` (+${summary.extraDistinctCount} more)`
        : '';
    return `${sanitized}${suffix}`;
  } catch (error) {
    log.error('Failed to load failed upload error text', { error });
    return null;
  }
}

function progressFromEvent(event: UploadSessionEvent): UploadProgress | null {
  if (event.type === 'start') {
    return { completed: 0, total: event.totalChapters };
  }
  if (event.type === 'progress') {
    return {
      completed: event.completedChapters,
      total: event.totalChapters,
    };
  }
  return null;
}

export function usePendingUploads(refreshKey = 0) {
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingChapterCount, setPendingChapterCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [failedErrorText, setFailedErrorText] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const [eventTick, setEventTick] = useState(0);

  useEffect(() => {
    return onUploadSessionEvent(event => {
      const progress = progressFromEvent(event);
      if (progress) {
        setIsUploading(true);
        setUploadProgress(progress);
      } else if (
        event.type === 'complete' ||
        event.type === 'idle' ||
        event.type === 'cancelled' ||
        event.type === 'paused' ||
        event.type === 'waiting_wifi'
      ) {
        setIsUploading(false);
        if (event.type === 'complete' || event.type === 'idle') {
          setUploadProgress(null);
        }
      }

      setEventTick(tick => tick + 1);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      loadPendingUploadCount(),
      loadFailedUploadCount(),
      loadFailedUploadErrorText(),
      getPendingUploadChapters(),
    ])
      .then(([pending, failed, failedError, chapters]) => {
        if (!cancelled) {
          setPendingCount(pending);
          setPendingChapterCount(chapters.length);
          setFailedCount(failed);
          setFailedErrorText(failed > 0 ? failedError : null);
        }
      })
      .catch(() => {
        // loaders already log and return 0
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey, eventTick]);

  return {
    pendingCount,
    pendingChapterCount,
    failedCount,
    failedErrorText,
    hasPendingUploads: pendingCount > 0,
    hasFailedUploads: failedCount > 0,
    isUploading,
    uploadProgress,
  };
}
