import { useState, useCallback, useRef } from 'react';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { isUserProjectMember } from '../db/repository';
import { getMilestoneChapters } from '../db/queries';
import { ProjectChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { getActiveUserId } from '../services/storage';
import { useFocusEffect } from 'expo-router';
import { logger } from '../utils/logger';

const log = logger.create('useMilestoneChapters');

export function useMilestoneChapters(projectUnitId: number, projectId: number) {
  const [chapters, setChapters] = useState<ProjectChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requestIdRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const membershipAllowsChaptersRef = useRef(false);
  const [removedFromProject, setRemovedFromProject] = useState(false);

  const loadChapters = useCallback(
    async (refreshGen?: number) => {
      // Ungated reload/refresh/retry must not publish cache while this open
      // is still waiting on membership, or after this open decided unassigned.
      if (refreshGen === undefined && !membershipAllowsChaptersRef.current) {
        return;
      }

      const requestId = ++requestIdRef.current;
      try {
        setError(null);

        const userId = parseUserId();
        if (userId === null) {
          if (
            requestId === requestIdRef.current &&
            (refreshGen === undefined ||
              refreshGenerationRef.current === refreshGen)
          ) {
            setChapters([]);
          }
          return;
        }

        const rows = await getMilestoneChapters(projectUnitId, userId);

        if (requestId !== requestIdRef.current) return;
        if (
          refreshGen !== undefined &&
          refreshGenerationRef.current !== refreshGen
        )
          return;

        setChapters(rows);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        if (
          refreshGen !== undefined &&
          refreshGenerationRef.current !== refreshGen
        )
          return;

        log.error('Error loading project chapters:', {
          error: err,
          projectUnitId,
          projectId,
        });
        setError(err);
        setChapters([]);
      } finally {
        if (
          requestId === requestIdRef.current &&
          (refreshGen === undefined ||
            refreshGenerationRef.current === refreshGen)
        ) {
          setLoading(false);
        }
      }
    },
    [projectUnitId, projectId],
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      const activeUserId = getActiveUserId();
      // No session to refresh: read the cache only. Offline still has a
      // session, so it waits for the local membership check below.
      if (!activeUserId) {
        membershipAllowsChaptersRef.current = true;
        void loadChapters();
        return;
      }

      membershipAllowsChaptersRef.current = false;
      refreshGenerationRef.current += 1;
      const generation = refreshGenerationRef.current;

      void (async () => {
        try {
          await refreshChapterMetadataIfOnline(Number(activeUserId));
        } catch (err) {
          log.error('Focus refresh failed', {
            error: err,
            projectUnitId,
            projectId,
          });
        }

        if (refreshGenerationRef.current !== generation) return;

        try {
          const stillMember = await isUserProjectMember(
            Number(activeUserId),
            projectId,
          );
          if (refreshGenerationRef.current !== generation) return;

          if (!stillMember) {
            membershipAllowsChaptersRef.current = false;
            setRemovedFromProject(true);
            setChapters([]);
            setLoading(false);
            return;
          }

          membershipAllowsChaptersRef.current = true;
          setRemovedFromProject(false);
          await loadChapters(generation);
        } catch (err) {
          if (refreshGenerationRef.current !== generation) return;
          log.error('Focus membership check failed', {
            error: err,
            projectUnitId,
            projectId,
          });
          setError(err);
          setLoading(false);
        }
      })();

      return () => {
        refreshGenerationRef.current += 1;
      };
    }, [loadChapters, projectId, projectUnitId]),
  );

  const refresh = useCallback(async () => {
    if (!membershipAllowsChaptersRef.current) {
      return;
    }
    setRefreshing(true);
    try {
      await loadChapters();
    } finally {
      setRefreshing(false);
    }
  }, [loadChapters]);

  const retry = useCallback(async () => {
    if (!membershipAllowsChaptersRef.current) {
      return;
    }
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
