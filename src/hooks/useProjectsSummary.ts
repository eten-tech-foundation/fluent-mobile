import { useState, useEffect, useCallback, useRef } from 'react';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { getProjectsWithSummary } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { ProjectSummary } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { useFocusEffect } from 'expo-router';
import { logger } from '../utils/logger';

const log = logger.create('useProjectsSummary');

export function useProjectsSummary(refreshKey = 0) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshGenerationRef = useRef(0);

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

  useFocusEffect(
    useCallback(() => {
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;

      refreshGenerationRef.current += 1;
      const generation = refreshGenerationRef.current;

      refreshChapterMetadataIfOnline(Number(activeUserId)).then(() => {
        if (refreshGenerationRef.current !== generation) return;
        void loadProjects();
      });

      return () => {
        refreshGenerationRef.current += 1;
      };
    }, [loadProjects]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProjects();
    } finally {
      setRefreshing(false);
    }
  }, [loadProjects]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { projects, loading, refreshing, refresh };
}
