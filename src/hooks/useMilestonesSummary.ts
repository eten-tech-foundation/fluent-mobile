import { useState, useEffect, useCallback, useRef } from 'react';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { getMilestonesWithSummary } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { MilestoneSummary } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { useFocusEffect } from 'expo-router';
import { logger } from '../utils/logger';

const log = logger.create('useMilestonesSummary');

export function useMilestonesSummary(refreshKey = 0) {
  const [milestones, setMilestones] = useState<MilestoneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshGenerationRef = useRef(0);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const needsReloadRef = useRef(false);

  const loadMilestones = useCallback(async () => {
    if (loadInFlightRef.current) {
      needsReloadRef.current = true;
      return loadInFlightRef.current;
    }

    const loadPromise = (async () => {
      const userId = parseUserId();
      if (!userId) {
        setMilestones([]);
        return;
      }

      try {
        setMilestones(await getMilestonesWithSummary(userId));
      } catch (error) {
        log.error('Error loading milestones:', { error });
      }
    })();

    loadInFlightRef.current = loadPromise;
    try {
      await loadPromise;
    } finally {
      loadInFlightRef.current = null;
      if (needsReloadRef.current) {
        needsReloadRef.current = false;
        void loadMilestones();
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadMilestones().finally(() => setLoading(false));
  }, [loadMilestones, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;

      refreshGenerationRef.current += 1;
      const generation = refreshGenerationRef.current;

      void loadMilestones();

      refreshChapterMetadataIfOnline(Number(activeUserId)).then(() => {
        if (refreshGenerationRef.current !== generation) return;
        void loadMilestones();
      });

      return () => {
        refreshGenerationRef.current += 1;
      };
    }, [loadMilestones]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadMilestones();
    } finally {
      setRefreshing(false);
    }
  }, [loadMilestones]);

  return { milestones, loading, refreshing, refresh };
}
