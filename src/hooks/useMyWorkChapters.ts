import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getMyWorkChapters } from '../db/queries';
import { MyWorkChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { getCredentials } from '../services/keychain';
import {
  getCommentAggregateCacheEntry,
  refreshMyWorkCommentAggregates,
} from '../services/myWorkCommentAggregates';
import { getActiveUserId } from '../services/storage';
import { getObserverProjectIds } from '../services/userOrgGrants';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { getTranslatorProjectIds } from '../utils/myWorkDraftDownload';
import { logger } from '../utils/logger';

const log = logger.create('useMyWorkChapters');

function resolveValidatedMyWorkUserId(): number | null {
  const activeRaw = getActiveUserId();
  if (!activeRaw) {
    return null;
  }
  const synced = parseUserId();
  if (synced === null || activeRaw !== String(synced)) {
    return null;
  }
  return synced;
}

function filterChaptersForCurrentGrants(
  chapters: MyWorkChapter[],
  grantProjectIds: readonly number[],
  translatorProjectIds: readonly number[],
): MyWorkChapter[] {
  const observerAllowed = new Set(grantProjectIds);
  const translatorAllowed = new Set(translatorProjectIds);
  return chapters.filter(chapter => {
    if (chapter.listAccess === 'assigned') {
      return true;
    }
    if (chapter.listAccess === 'open_peer') {
      return translatorAllowed.has(chapter.projectId);
    }
    if (chapter.listAccess === 'observer') {
      return observerAllowed.has(chapter.projectId);
    }
    return false;
  });
}

function attachCachedCommentAggregates(
  chapters: MyWorkChapter[],
  userId: string,
): MyWorkChapter[] {
  return chapters.map(chapter => {
    const entry = getCommentAggregateCacheEntry(userId, chapter.id);
    if (entry.status !== 'known') {
      // Strip any prior known prop; unknown/missing must not surface 0/false.
      const { commentAggregate: _dropped, ...rest } = chapter;
      return rest;
    }
    return {
      ...chapter,
      commentAggregate: {
        status: 'known',
        commentCount: entry.commentCount,
        currentUserHasCommented: entry.currentUserHasCommented,
        originatingUserId: userId,
      },
    };
  });
}

export function useMyWorkChapters(refreshKey = 0) {
  const [chapters, setChapters] = useState<MyWorkChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshGenerationRef = useRef(0);
  const loadGenerationRef = useRef(0);

  const loadChapters = useCallback(async () => {
    const userId = resolveValidatedMyWorkUserId();
    if (userId === null) {
      // Invalidate in-flight loads so a prior query cannot publish later.
      loadGenerationRef.current += 1;
      setChapters([]);
      return;
    }

    const generation = ++loadGenerationRef.current;
    const requestUserId = userId;
    const requestUserIdStr = String(requestUserId);
    // Unknown/revoked grant snapshots yield [] — fail closed for those branches.
    const grantProjectIds = getObserverProjectIds(requestUserIdStr);
    const translatorProjectIds = getTranslatorProjectIds(requestUserIdStr);

    try {
      const next = await getMyWorkChapters(requestUserId, {
        grantProjectIds,
        translatorProjectIds,
      });
      if (loadGenerationRef.current !== generation) {
        return;
      }
      const currentUserId = resolveValidatedMyWorkUserId();
      if (currentUserId !== requestUserId) {
        // Drop other-account rows; do not leave stale Observer/assigned visible.
        setChapters([]);
        return;
      }
      // Re-read current known grant project IDs before publishing — grants
      // may have been revoked/unknown while the SQL await was in flight.
      const currentGrantIds = getObserverProjectIds(String(currentUserId));
      const currentTranslatorIds = getTranslatorProjectIds(
        String(currentUserId),
      );
      const eligible = filterChaptersForCurrentGrants(
        next,
        currentGrantIds,
        currentTranslatorIds,
      );
      // Publish SQLite rows + cached aggregates immediately; network refresh
      // must not delay the chapter list or clear rows on credential/refresh errors.
      setChapters(
        attachCachedCommentAggregates(eligible, String(currentUserId)),
      );

      // Optional aggregate wave: credentials + refresh + re-attach. Entirely
      // behind a void boundary so rejections never hit the outer catch (which
      // would clear already-published chapter rows) and never hold loading.
      void (async () => {
        try {
          const refreshUserId = resolveValidatedMyWorkUserId();
          if (
            refreshUserId !== requestUserId ||
            loadGenerationRef.current !== generation
          ) {
            return;
          }
          const refreshUserIdStr = String(refreshUserId);
          const creds = await getCredentials(refreshUserIdStr);
          if (
            loadGenerationRef.current !== generation ||
            resolveValidatedMyWorkUserId() !== refreshUserId
          ) {
            return;
          }
          if (!creds?.token) {
            return;
          }
          const sessionToken = creds.token;
          const assignmentIds = eligible.map(chapter => chapter.id);

          await refreshMyWorkCommentAggregates({
            userId: refreshUserIdStr,
            sessionToken,
            chapterAssignmentIds: assignmentIds,
          });
          if (loadGenerationRef.current !== generation) {
            return;
          }
          const stillUserId = resolveValidatedMyWorkUserId();
          if (stillUserId !== refreshUserId) {
            return;
          }
          // Re-read grant eligibility so a late aggregate wave cannot reintroduce
          // revoked Observer / open-peer rows.
          const stillEligible = filterChaptersForCurrentGrants(
            eligible,
            getObserverProjectIds(String(stillUserId)),
            getTranslatorProjectIds(String(stillUserId)),
          );
          setChapters(
            attachCachedCommentAggregates(stillEligible, String(stillUserId)),
          );
        } catch (error) {
          log.warn('Comment aggregate background refresh failed', { error });
        }
      })();
    } catch (error) {
      if (loadGenerationRef.current !== generation) {
        return;
      }
      log.error('Error loading my work chapters', { error });
      if (resolveValidatedMyWorkUserId() === requestUserId) {
        setChapters([]);
      }
    }
  }, []);

  useEffect(() => {
    loadGenerationRef.current += 1;
    setLoading(true);
    loadChapters().finally(() => setLoading(false));
  }, [loadChapters, refreshKey]);

  // #273: pull latest assignment/stage metadata in the background on chapter
  // list open, then re-read the cache. Uses getActiveUserId (not parseUserId)
  // because the two can drift on shared/multi-account devices, and calling the
  // API with a userId that doesn't match the live bearer token 403s (see #291).
  useFocusEffect(
    useCallback(() => {
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;

      refreshGenerationRef.current += 1;
      const generation = refreshGenerationRef.current;

      refreshChapterMetadataIfOnline(Number(activeUserId)).then(() => {
        if (refreshGenerationRef.current !== generation) return;
        void loadChapters();
      });

      return () => {
        refreshGenerationRef.current += 1;
      };
    }, [loadChapters]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadChapters();
    } finally {
      setRefreshing(false);
    }
  }, [loadChapters]);

  return { chapters, loading, refreshing, refresh };
}
