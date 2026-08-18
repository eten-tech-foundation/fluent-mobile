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
        void loadChapters(generation);
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
