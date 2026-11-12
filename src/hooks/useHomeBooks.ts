import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  DatabaseWriteMark,
  getDatabaseWriteMark,
  getHomeBookSummaries,
  sameDatabaseWrites,
} from '../db/queries';
import { getActiveUserId } from '../services/storage';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import type { HomeBookSummary } from '../types/db/types';
import { logger } from '../utils/logger';
import { parseUserId } from '../utils/parseUserId';
import { sameRows } from '../utils/sameRows';

const log = logger.create('useHomeBooks');

/**
 * Every book in the milestones I belong to, counted by whose turn each
 * chapter is. Like `useMyWorkChapters`: `loading` is only the first read,
 * an unchanged read keeps the same array, and it reads again on `refresh`,
 * and after a sync (`refreshKey`) or on returning to the screen when the
 * database was written or the account changed since the books were read,
 * so Home's sections update together.
 */
export function useHomeBooks(refreshKey = 0) {
  const [books, setBookRows] = useState<HomeBookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const loadGenerationRef = useRef(0);
  const focusedBeforeRef = useRef(false);
  const keyedBeforeRef = useRef(false);
  const publishedRef = useRef<{
    userId: number;
    writes: DatabaseWriteMark | null;
  } | null>(null);

  // Only a read that publishes (or fails) ends the first load.
  const setBooks = useCallback((next: HomeBookSummary[]) => {
    setBookRows(prev => (sameRows(prev, next) ? prev : next));
    setLoading(false);
  }, []);

  /** `writesBefore`: a write mark the caller just took, saving a second one. */
  const readBooks = useCallback(
    async (writesBefore?: DatabaseWriteMark | null) => {
      const userId = parseUserId();
      if (!userId) {
        // A signed-out read must not publish after this.
        loadGenerationRef.current += 1;
        publishedRef.current = null;
        setBooks([]);
        return;
      }
      const generation = ++loadGenerationRef.current;
      try {
        // Taken before the read: a write landing during it counts as unseen.
        // The read is queued right behind the mark on the one connection, so
        // it need not wait for the mark's answer.
        const [writes, next] = await Promise.all([
          writesBefore === undefined ? getDatabaseWriteMark() : writesBefore,
          getHomeBookSummaries(userId),
        ]);
        if (loadGenerationRef.current !== generation) return;
        if (parseUserId() !== userId) {
          publishedRef.current = null;
          setBooks([]);
          return;
        }
        publishedRef.current = { userId, writes };
        setBooks(next);
      } catch (error) {
        if (loadGenerationRef.current !== generation) return;
        log.error('Error loading home books', { error });
        publishedRef.current = null;
        // Keep the books already on screen. An empty list is what "no books" looks like.
        setLoading(false);
      }
    },
    [setBooks],
  );

  const loadBooks = useCallback(() => readBooks(), [readBooks]);

  const loadBooksIfChanged = useCallback(async () => {
    const writes = await getDatabaseWriteMark();
    // Whatever is on screen now, which may be newer than when focus came back.
    const read = publishedRef.current;
    if (
      read &&
      parseUserId() === read.userId &&
      sameDatabaseWrites(read.writes, writes)
    ) {
      return;
    }
    await readBooks(writes);
  }, [readBooks]);

  useEffect(() => {
    if (keyedBeforeRef.current) void loadBooksIfChanged();
    else void loadBooks();
    keyedBeforeRef.current = true;
  }, [loadBooks, loadBooksIfChanged, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      if (focusedBeforeRef.current) void loadBooksIfChanged();
      focusedBeforeRef.current = true;
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;
      void refreshChapterMetadataIfOnline(Number(activeUserId));
    }, [loadBooksIfChanged]),
  );

  return { books, loading, refresh: loadBooks };
}
