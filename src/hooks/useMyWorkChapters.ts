import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getMyWorkChapters } from '../db/queries';
import { MyWorkChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { getActiveUserId } from '../services/storage';
import { getObserverProjectIds } from '../services/userOrgGrants';
import { refreshChapterMetadataIfOnline } from '../services/sync';
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
): MyWorkChapter[] {
  const allowed = new Set(grantProjectIds);
  return chapters.filter(chapter => {
    if (chapter.listAccess === 'assigned') {
      return true;
    }
    if (chapter.listAccess === 'observer') {
      return allowed.has(chapter.projectId);
    }
    return false;
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
    // Unknown/revoked grant snapshots yield [] — no Observer rows in SQL.
    const grantProjectIds = getObserverProjectIds(String(requestUserId));

    try {
      const next = await getMyWorkChapters(requestUserId, { grantProjectIds });
      if (loadGenerationRef.current !== generation) {
        return;
      }
      const currentUserId = resolveValidatedMyWorkUserId();
      if (currentUserId !== requestUserId) {
        // Drop other-account rows; do not leave stale Observer/assigned visible.
        setChapters([]);
        return;
      }
      // Re-read current known Observer project IDs before publishing — grant
      // may have been revoked/unknown while the SQL await was in flight.
      const currentGrantIds = getObserverProjectIds(String(currentUserId));
      setChapters(filterChaptersForCurrentGrants(next, currentGrantIds));
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
