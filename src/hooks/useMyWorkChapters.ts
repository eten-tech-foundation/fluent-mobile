import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getMyWorkChapters } from '../db/queries';
import { MyWorkChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { logger } from '../utils/logger';

const log = logger.create('useMyWorkChapters');

export function useMyWorkChapters(refreshKey = 0) {
  const [chapters, setChapters] = useState<MyWorkChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshGenerationRef = useRef(0);

  const loadChapters = useCallback(async () => {
    const userId = parseUserId();
    if (!userId) {
      setChapters([]);
      return;
    }

    try {
      setChapters(await getMyWorkChapters(userId));
    } catch (error) {
      log.error('Error loading my work chapters', { error });
      setChapters([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadChapters().finally(() => setLoading(false));
  }, [loadChapters, refreshKey]);

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
        void loadChapters();
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

  return { chapters, loading, refreshing, refresh };
}
