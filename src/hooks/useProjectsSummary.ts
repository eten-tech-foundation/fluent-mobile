import { useState, useEffect, useCallback } from 'react';
import { getProjectsWithSummary } from '../db/queries';
import { ProjectSummary } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { logger } from '../utils/logger';

const log = logger.create('useProjectsSummary');

export function useProjectsSummary(refreshKey = 0) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProjects = useCallback(async () => {
    const userId = parseUserId();
    if (!userId) {
      setProjects([]);
      return;
    }

    try {
      setProjects(await getProjectsWithSummary(userId));
    } catch (error) {
      log.error('Error loading projects:', { error });
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadProjects().finally(() => setLoading(false));
  }, [loadProjects, refreshKey]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProjects();
    } finally {
      setRefreshing(false);
    }
  }, [loadProjects]);

  return { projects, loading, refreshing, refresh };
}
