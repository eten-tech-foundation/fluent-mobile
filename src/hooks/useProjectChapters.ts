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
  const [removedFromProject, setRemovedFromProject] = useState(false);
  const refreshGenerationRef = useRef(0);

  const loadChapters = useCallback(
    async (generation?: number) => {
      try {
        setError(null);

        const userId = parseUserId();
        if (userId === null) {
          if (
            generation === undefined ||
            refreshGenerationRef.current === generation
          ) {
            setChapters([]);
          }
          return;
        }

        const nextChapters = await getProjectChapters(projectId, userId);

        if (
          generation !== undefined &&
          refreshGenerationRef.current !== generation
        ) {
          return;
        }

        setChapters(nextChapters);
      } catch (err) {
        if (
          generation !== undefined &&
          refreshGenerationRef.current !== generation
        ) {
          return;
        }

        log.error('Error loading project chapters:', {
          error: err,
          projectId,
        });
        setError(err);
        setChapters([]);
      } finally {
        if (
          generation === undefined ||
          refreshGenerationRef.current === generation
        ) {
          setLoading(false);
        }
      }
    },
    [projectId],
  );

  useEffect(() => {
    setLoading(true);
    loadChapters();
  }, [loadChapters]);

  useFocusEffect(
    useCallback(() => {
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;

      refreshGenerationRef.current += 1;
      const generation = refreshGenerationRef.current;

      refreshChapterMetadataIfOnline(Number(activeUserId)).then(async () => {
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
