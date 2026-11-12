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
import { markStartup } from '../utils/startupTrace';

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
  // True from a failed read until one succeeds, so Home can tell "no books"
  // from "couldn't read the books" when there is nothing else to show.
  const [error, setError] = useState(false);
  // See useMyWorkChapters: true during a read, including the render where
  // refreshKey changes, so an empty Home doesn't flash ahead of the read.
  const [reading, setReading] = useState(true);
  const [seenRefreshKey, setSeenRefreshKey] = useState(refreshKey);
  if (seenRefreshKey !== refreshKey) {
    setSeenRefreshKey(refreshKey);
    setReading(true);
  }
  const loadGenerationRef = useRef(0);
  const focusedBeforeRef = useRef(false);
  const keyedBeforeRef = useRef(false);
  const publishedRef = useRef<{
    userId: number;
    writes: DatabaseWriteMark | null;
  } | null>(null);

  // Only a read that publishes (or fails) ends the first load.
  const setBooks = useCallback((next: HomeBookSummary[]) => {
    markStartup('books_read', { count: next.length });
    setBookRows(prev => (sameRows(prev, next) ? prev : next));
    setError(false);
    setLoading(false);
    setReading(false);
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
        // Keep the books already on screen; `error` says they may be stale.
        setError(true);
        setLoading(false);
        setReading(false);
      }
    },
    [setBooks],
  );

  const loadBooks = useCallback(() => readBooks(), [readBooks]);

  const loadBooksIfChanged = useCallback(async () => {
    // See useMyWorkChapters: an earlier sync's read must not end `reading`.
    const generation = ++loadGenerationRef.current;
    let writes: DatabaseWriteMark | null;
    try {
      writes = await getDatabaseWriteMark();
    } catch (error) {
      if (loadGenerationRef.current !== generation) return;
      log.error('Error loading home books', { error });
      // Unverified now, so the next check reads instead of keeping `error`.
      publishedRef.current = null;
      setError(true);
      setLoading(false);
      setReading(false);
      return;
    }
    if (loadGenerationRef.current !== generation) return;
    // Whatever is on screen now, which may be newer than when focus came back.
    const read = publishedRef.current;
    if (
      read &&
      parseUserId() === read.userId &&
      sameDatabaseWrites(read.writes, writes)
    ) {
      // Nothing was written, so no read is in flight to keep `reading` up.
      setReading(false);
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

  return { books, loading, error, reading, refresh: loadBooks };
}
