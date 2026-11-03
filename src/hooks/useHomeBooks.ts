import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getHomeBookSummaries } from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import type { HomeBookSummary } from '../types/db/types';
import { logger } from '../utils/logger';
import { parseUserId } from '../utils/parseUserId';

const log = logger.create('useHomeBooks');

/**
 * Every book in the milestones I belong to, counted by whose turn each
 * chapter is. Reloads after a sync (`refreshKey`), and on focus once the
 * background metadata refresh lands, like `useMyWorkChapters`, so Home's
 * sections update together.
 */
export function useHomeBooks(refreshKey = 0) {
  const [books, setBooks] = useState<HomeBookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshGenerationRef = useRef(0);
  const loadGenerationRef = useRef(0);

  const loadBooks = useCallback(async () => {
    const userId = parseUserId();
    if (!userId) {
      // A signed-out read must not publish after this.
      loadGenerationRef.current += 1;
      setBooks([]);
      return;
    }
    const generation = ++loadGenerationRef.current;
    try {
      const next = await getHomeBookSummaries(userId);
      if (loadGenerationRef.current !== generation) return;
      if (parseUserId() !== userId) {
        setBooks([]);
        return;
      }
      setBooks(next);
    } catch (error) {
      if (loadGenerationRef.current !== generation) return;
      log.error('Error loading home books', { error });
      // Keep the books already on screen. An empty list is what "no books" looks like.
    }
  }, []);

  useEffect(() => {
    loadGenerationRef.current += 1;
    setLoading(true);
    loadBooks().finally(() => setLoading(false));
  }, [loadBooks, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;

      refreshGenerationRef.current += 1;
      const generation = refreshGenerationRef.current;

      refreshChapterMetadataIfOnline(Number(activeUserId)).then(() => {
        if (refreshGenerationRef.current !== generation) return;
        void loadBooks();
      });

      return () => {
        refreshGenerationRef.current += 1;
      };
    }, [loadBooks]),
  );

  return { books, loading, refresh: loadBooks };
}
