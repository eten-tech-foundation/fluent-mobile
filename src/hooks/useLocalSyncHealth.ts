import { useEffect, useState } from 'react';
import {
  countChaptersMissingBibleText,
  getDatabaseWriteMark,
  sameDatabaseWrites,
  type DatabaseWriteMark,
} from '../db/queries';
import { userNeedsAssigneeRepair } from '../db/repository';
import { parseUserId } from '../utils/parseUserId';
import { logger } from '../utils/logger';

const log = logger.create('useLocalSyncHealth');

/**
 * The last check where both reads succeeded, with the user and database write
 * mark it was read at. Every header shares it: both answers are a function of
 * those rows and the user, so a remounting header need not read them again.
 */
let cleanCheck: {
  userId: number;
  writes: DatabaseWriteMark;
  needsDownloadSync: boolean;
  missingTextChapters: number;
} | null = null;

/** Test hook: forget the last check. */
export function resetLocalSyncHealthForTests(): void {
  cleanCheck = null;
}

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

      // Taken before the reads: a write landing during them counts as unseen.
      const writes = await getDatabaseWriteMark();
      if (cancelled) return;
      const last = cleanCheck;
      if (
        last &&
        last.userId === userId &&
        sameDatabaseWrites(last.writes, writes)
      ) {
        setNeedsDownloadSync(last.needsDownloadSync);
        setMissingTextChapters(last.missingTextChapters);
        setChecking(false);
        return;
      }

      let needs: boolean | null = null;
      let missing: number | null = null;
      try {
        needs = await userNeedsAssigneeRepair(userId);
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
        missing = await countChaptersMissingBibleText([userId]);
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
      cleanCheck =
        writes && needs !== null && missing !== null
          ? {
              userId,
              writes,
              needsDownloadSync: needs,
              missingTextChapters: missing,
            }
          : null;
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { needsDownloadSync, missingTextChapters, checking };
}
