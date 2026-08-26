import { useState, useCallback, useRef } from 'react';
import { getProjectChapters } from '../db/queries';
import { ProjectChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { useFocusEffect } from 'expo-router';
import { logger } from '../utils/logger';

const log = logger.create('useProjectChapters');

export function useProjectChapters(projectId: number) {
  const [chapters, setChapters] = useState<ProjectChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestIdRef = useRef(0);

  const loadChapters = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      setError(null);
      const userId = parseUserId();
      if (userId === null) {
        if (requestId === requestIdRef.current) {
          setChapters([]);
        }
        return;
      }
      const rows = await getProjectChapters(projectId, userId);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setChapters(rows);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      log.error('Error loading project chapters:', { error: err, projectId });
      setError(err);
      setChapters([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadChapters();
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

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

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
