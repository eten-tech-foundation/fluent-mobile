import { useState, useEffect, useCallback, useRef } from 'react';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { isUserProjectMember } from '../db/repository';
import { getProjectChapters } from '../db/queries';
import { ProjectChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { getActiveUserId } from '../services/storage';
import { useFocusEffect } from 'expo-router';
import { logger } from '../utils/logger';

const log = logger.create('useProjectChapters');

export function useProjectChapters(projectId: number) {
  const [chapters, setChapters] = useState<ProjectChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestIdRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const [removedFromProject, setRemovedFromProject] = useState(false);

  const loadChapters = useCallback(
    async (refreshGen?: number) => {
      const requestId = ++requestIdRef.current;
      try {
        setError(null);

        const userId = parseUserId();
        if (userId === null) {
          if (
            requestId === requestIdRef.current &&
            (refreshGen === undefined || refreshGenerationRef.current === refreshGen)
          ) {
            setChapters([]);
          }
          return;
        }

        const rows = await getProjectChapters(projectId, userId);

        if (requestId !== requestIdRef.current) return;
        if (refreshGen !== undefined && refreshGenerationRef.current !== refreshGen) return;

        setChapters(rows);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        if (refreshGen !== undefined && refreshGenerationRef.current !== refreshGen) return;

        log.error('Error loading project chapters:', { error: err, projectId });
        setError(err);
        setChapters([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [projectId],
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadChapters();
    }, [loadChapters]),
  );

  useFocusEffect(
    useCallback(() => {
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;

      refreshGenerationRef.current += 1;
      const generation = refreshGenerationRef.current;

      refreshChapterMetadataIfOnline(Number(activeUserId))
        .then(async () => {
          if (refreshGenerationRef.current !== generation) return;

          const stillMember = await isUserProjectMember(
            Number(activeUserId),
            projectId,
          );
          if (refreshGenerationRef.current !== generation) return;

          if (!stillMember) {
            setRemovedFromProject(true);
            return;
          }

          setRemovedFromProject(false);
          void loadChapters(generation);
        })
        .catch(err => {
          log.error('Focus refresh failed', { error: err, projectId });
        });

      return () => {
        refreshGenerationRef.current += 1;
      };
    }, [loadChapters, projectId]),
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
    removedFromProject,
    refresh,
    retry,
    reload: loadChapters,
  };
}
