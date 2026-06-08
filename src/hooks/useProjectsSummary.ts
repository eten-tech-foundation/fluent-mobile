import { useState, useEffect, useCallback } from 'react';
import { getProjectsWithSummary } from '../db/queries';
import { ProjectSummary } from '../types/db/types';
import { logger } from '../utils/logger';

const log = logger.create('useProjectsSummary');

export function useProjectsSummary(refreshKey = 0) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await getProjectsWithSummary());
    } catch (error) {
      log.error('Error loading projects:', { error });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadProjects();
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
