import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getProjectChapters } from '../db/queries';
import { ProjectChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { logger } from '../utils/logger';

const log = logger.create('useProjectChapters');

export function useProjectChapters(projectId: number) {
  const [chapters, setChapters] = useState<ProjectChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const hasFocusedBefore = useRef(false);

  const loadChapters = useCallback(async () => {
    try {
      setError(null);
      const userId = parseUserId();
      if (userId === null) {
        setChapters([]);
        return;
      }
      setChapters(await getProjectChapters(projectId, userId));
    } catch (err) {
      log.error('Error loading project chapters:', { error: err, projectId });
      setError(err);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    loadChapters();
  }, [loadChapters]);

  // #273: on re-focus (not initial mount — that's covered by the effect
  // above, and immediately post-login data is already fresh from the login
  // sync), pull latest assignment/stage metadata in the background and
  // re-read the cache. Uses getActiveUserId (not parseUserId) — the two can
  // drift on shared/multi-account devices, and calling the API with a
  // userId that doesn't match the live bearer token 403s (see #291).
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedBefore.current) {
        hasFocusedBefore.current = true;
        return;
      }

      const activeUserId = getActiveUserId();
      if (!activeUserId) return;

      refreshChapterMetadataIfOnline(Number(activeUserId)).then(() => {
        void loadChapters();
      });
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

  const retry = useCallback(async () => {
    setLoading(true);
    await loadChapters();
  }, [loadChapters]);

  return {
    chapters,
    loading,
    refreshing,
    error,
    refresh,
    retry,
    reload: loadChapters,
  };
}
