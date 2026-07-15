import { useEffect, useState } from 'react';
import { userNeedsAssigneeRepair } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';
import { logger } from '../utils/logger';

const log = logger.create('useLocalSyncHealth');

/**
 * Detects when SQLite has project chapters but is missing assignee/checker
 * fields needed for My Work — usually means a download sync is required.
 */
export function useLocalSyncHealth(refreshKey = 0) {
  const [needsDownloadSync, setNeedsDownloadSync] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      setChecking(true);
      const userId = parseUserId();

      if (!userId) {
        if (!cancelled) {
          setNeedsDownloadSync(false);
          setChecking(false);
        }
        return;
      }

      try {
        const needs = await userNeedsAssigneeRepair(userId);
        if (!cancelled) {
          setNeedsDownloadSync(needs);
        }
      } catch (error) {
        log.error('Failed to check local sync health', { error, userId });
        if (!cancelled) {
          setNeedsDownloadSync(false);
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { needsDownloadSync, checking };
}
