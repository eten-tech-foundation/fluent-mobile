import { useCallback, useEffect, useState } from 'react';
import { getMyWorkChapters } from '../db/queries';
import { MyWorkChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { logger } from '../utils/logger';

const log = logger.create('useMyWorkChapters');

export function useMyWorkChapters(refreshKey = 0) {
  const [chapters, setChapters] = useState<MyWorkChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChapters = useCallback(async () => {
    const userId = parseUserId();
    if (!userId) {
      setChapters([]);
      return;
    }

    try {
      setChapters(await getMyWorkChapters(userId));
    } catch (error) {
      log.error('Error loading my work chapters:', { error });
      setChapters([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadChapters().finally(() => setLoading(false));
  }, [loadChapters, refreshKey]);

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
