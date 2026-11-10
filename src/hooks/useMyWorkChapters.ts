import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  DatabaseWriteMark,
  getDatabaseWriteMark,
  getMyWorkChapters,
  sameDatabaseWrites,
} from '../db/queries';
import { MyWorkChapter } from '../types/db/types';
import { parseUserId } from '../utils/parseUserId';
import { getActiveUserId } from '../services/storage';
import { getObserverProjectIds } from '../services/userOrgGrants';
import { refreshChapterMetadataIfOnline } from '../services/sync';
import { getTranslatorProjectIds } from '../utils/myWorkDraftDownload';
import { logger } from '../utils/logger';
import { sameRows } from '../utils/sameRows';

const log = logger.create('useMyWorkChapters');

function resolveValidatedMyWorkUserId(): number | null {
  const activeRaw = getActiveUserId();
  if (!activeRaw) {
    return null;
  }
  const synced = parseUserId();
  if (synced === null || activeRaw !== String(synced)) {
    return null;
  }
  return synced;
}

function filterChaptersForCurrentGrants(
  chapters: MyWorkChapter[],
  grantProjectIds: readonly number[],
  translatorProjectIds: readonly number[],
): MyWorkChapter[] {
  const observerAllowed = new Set(grantProjectIds);
  const translatorAllowed = new Set(translatorProjectIds);
  return chapters.filter(chapter => {
    if (chapter.listAccess === 'assigned') {
      return true;
    }
    if (chapter.listAccess === 'open_peer') {
      return translatorAllowed.has(chapter.projectId);
    }
    if (chapter.listAccess === 'observer') {
      return observerAllowed.has(chapter.projectId);
    }
    return false;
  });
}

function grantsKey(
  grantProjectIds: readonly number[],
  translatorProjectIds: readonly number[],
): string {
  return `${grantProjectIds.join(',')}|${translatorProjectIds.join(',')}`;
}

function currentGrantsKey(userId: number): string {
  const id = String(userId);
  return grantsKey(getObserverProjectIds(id), getTranslatorProjectIds(id));
}

/** What the list on screen was queried with. */
type PublishedRead = {
  userId: number;
  grants: string;
  writes: DatabaseWriteMark | null;
};

/**
 * My Work's chapters from SQLite. `loading` is only the first read; later
 * reads keep the list on screen, and an unchanged read keeps the same array.
 * Reads again on `refresh`, and when `refreshKey` changes (the caller bumps
 * it on sync complete) or focus comes back, if the database was written, the
 * account changed or its grants changed since the list's read.
 */
export function useMyWorkChapters(refreshKey = 0) {
  const [chapters, setChapterRows] = useState<MyWorkChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadGenerationRef = useRef(0);
  const focusedBeforeRef = useRef(false);
  const keyedBeforeRef = useRef(false);
  const publishedRef = useRef<PublishedRead | null>(null);

  // Only a read that publishes ends the first load; a superseded one doesn't.
  const setChapters = useCallback((next: MyWorkChapter[]) => {
    setChapterRows(prev => (sameRows(prev, next) ? prev : next));
    setLoading(false);
  }, []);

  /** `writesBefore`: a write mark the caller just took, saving a second one. */
  const loadChapters = useCallback(
    async (writesBefore?: DatabaseWriteMark | null) => {
      const userId = resolveValidatedMyWorkUserId();
      if (userId === null) {
        // Invalidate in-flight loads so a prior query cannot publish later.
        loadGenerationRef.current += 1;
        publishedRef.current = null;
        setChapters([]);
        return;
      }

      const generation = ++loadGenerationRef.current;
      const requestUserId = userId;
      // Unknown/revoked grant snapshots yield [] — fail closed for those branches.
      const grantProjectIds = getObserverProjectIds(String(requestUserId));
      const translatorProjectIds = getTranslatorProjectIds(
        String(requestUserId),
      );

      try {
        // Taken before the read: a write landing during it counts as unseen.
        // The read is queued right behind the mark on the one connection, so
        // it need not wait for the mark's answer.
        const [writes, next] = await Promise.all([
          writesBefore === undefined ? getDatabaseWriteMark() : writesBefore,
          getMyWorkChapters(requestUserId, {
            grantProjectIds,
            translatorProjectIds,
          }),
        ]);
        if (loadGenerationRef.current !== generation) {
          return;
        }
        const currentUserId = resolveValidatedMyWorkUserId();
        if (currentUserId !== requestUserId) {
          // Drop other-account rows; do not leave stale Observer/assigned visible.
          publishedRef.current = null;
          setChapters([]);
          return;
        }
        // Re-read current known grant project IDs before publishing — grants
        // may have been revoked/unknown while the SQL await was in flight.
        const currentGrantIds = getObserverProjectIds(String(currentUserId));
        const currentTranslatorIds = getTranslatorProjectIds(
          String(currentUserId),
        );
        // The grants the query ran with: rows a grant gained since then were
        // never queried, so a later focus must see the difference and read.
        publishedRef.current = {
          userId: currentUserId,
          grants: grantsKey(grantProjectIds, translatorProjectIds),
          writes,
        };
        setChapters(
          filterChaptersForCurrentGrants(
            next,
            currentGrantIds,
            currentTranslatorIds,
          ),
        );
      } catch (error) {
        if (loadGenerationRef.current !== generation) {
          return;
        }
        log.error('Error loading my work chapters', { error });
        // Fail closed like the success path: clear even if the account changed
        // during the await so prior-account rows cannot linger.
        publishedRef.current = null;
        setChapters([]);
      }
    },
    [setChapters],
  );

  const loadChaptersIfChanged = useCallback(async () => {
    const writes = await getDatabaseWriteMark();
    // Whatever is on screen now, which may be newer than when focus came back.
    const read = publishedRef.current;
    const userId = resolveValidatedMyWorkUserId();
    if (
      read &&
      userId === read.userId &&
      currentGrantsKey(userId) === read.grants &&
      sameDatabaseWrites(read.writes, writes)
    ) {
      return;
    }
    await loadChapters(writes);
  }, [loadChapters]);

  useEffect(() => {
    if (keyedBeforeRef.current) void loadChaptersIfChanged();
    else void loadChapters();
    keyedBeforeRef.current = true;
  }, [loadChapters, loadChaptersIfChanged, refreshKey]);

  // #273: pull latest assignment/stage metadata in the background on chapter
  // list open. A refresh that reaches the server ends in sync complete, and the
  // caller's refreshKey re-reads then. Returning to the list re-reads at once
  // for changes made on this phone meanwhile (a take recorded elsewhere), and
  // skips the read when nothing was written.
  // Uses getActiveUserId (not parseUserId) because the two can drift on
  // shared/multi-account devices, and calling the API with a userId that
  // doesn't match the live bearer token 403s (see #291).
  useFocusEffect(
    useCallback(() => {
      if (focusedBeforeRef.current) void loadChaptersIfChanged();
      focusedBeforeRef.current = true;
      const activeUserId = getActiveUserId();
      if (!activeUserId) return;
      void refreshChapterMetadataIfOnline(Number(activeUserId));
    }, [loadChaptersIfChanged]),
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
