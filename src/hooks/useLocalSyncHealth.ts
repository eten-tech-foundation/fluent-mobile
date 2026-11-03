import { useEffect, useState } from 'react';
import { countChaptersMissingBibleText } from '../db/queries';
import { userNeedsAssigneeRepair } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';
import { logger } from '../utils/logger';

const log = logger.create('useLocalSyncHealth');

/**
 * Detects when SQLite has project chapters but is missing assignee/checker
 * fields needed for My Work — usually means a download sync is required.
 * Also counts chapters whose verse text a sync could still fetch, which the
 * assignee check does not see.
 */
export function useLocalSyncHealth(refreshKey = 0) {
  const [needsDownloadSync, setNeedsDownloadSync] = useState(false);
  const [missingTextChapters, setMissingTextChapters] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      setChecking(true);
      const userId = parseUserId();

      if (!userId) {
        if (!cancelled) {
          setNeedsDownloadSync(false);
          setMissingTextChapters(0);
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
      }

      // Separate from the assignee repair above: a text gap must not fail the
      // repair signal, and a repair failure must not hide a text gap.
      try {
        const missing = await countChaptersMissingBibleText([userId]);
        if (!cancelled) {
          setMissingTextChapters(missing);
        }
      } catch (error) {
        log.error('Failed to count chapters missing text', { error, userId });
        if (!cancelled) {
          setMissingTextChapters(0);
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

  return { needsDownloadSync, missingTextChapters, checking };
}
