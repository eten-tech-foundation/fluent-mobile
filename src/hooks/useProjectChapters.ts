import { useState, useEffect, useCallback } from 'react';
import { getProjectChapters } from '../db/queries';
import { ProjectChapter } from '../types/db/types';
import { logger } from '../utils/logger';

const log = logger.create('useProjectChapters');

export function useProjectChapters(projectId: number) {
  const [chapters, setChapters] = useState<ProjectChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const loadChapters = useCallback(async () => {
    try {
      setError(null);
      setChapters(await getProjectChapters(projectId));
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
