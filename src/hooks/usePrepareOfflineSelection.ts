import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPrepareOfflineChapters } from '../db/queries.prepareOffline';
import { PrepareOfflineBookGroup } from '../types/prepareOffline/types';
import { groupChaptersByBook } from '../utils/groupChaptersByBook';
import { logger } from '../utils/logger';

const log = logger.create('usePrepareOfflineSelection');

function buildInitialSelection(
  chapters: { id: number; assignedUserId: number | null }[],
  userId: number | null,
): { selectedIds: Set<number>; isAssignedUser: boolean } {
  if (!userId) {
    return { selectedIds: new Set(), isAssignedUser: false };
  }

  const assignedIds = chapters
    .filter(ch => ch.assignedUserId === userId)
    .map(ch => ch.id);

  return {
    selectedIds: new Set(assignedIds),
    isAssignedUser: assignedIds.length > 0,
  };
}

export function usePrepareOfflineSelection(
  projectId: number | null,
  userId: number | null,
) {
  const [chapters, setChapters] = useState<
    Awaited<ReturnType<typeof getPrepareOfflineChapters>>
  >([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<unknown>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isAssignedUser, setIsAssignedUser] = useState(false);
  const [accordionExpanded, setAccordionExpanded] = useState(true);
  const [expandedBookIds, setExpandedBookIds] = useState<Set<number>>(
    new Set(),
  );
  const initializedForKeyRef = useRef<string | null>(null);

  const loadChapters = useCallback(async () => {
    if (!projectId) {
      setChapters([]);
      setLoading(false);
      setError(null);
      initializedForKeyRef.current = null;
      return;
    }

    const initKey = `${projectId}:${userId ?? 'none'}`;

    try {
      setError(null);
      setLoading(true);
      const rows = await getPrepareOfflineChapters(projectId);
      setChapters(rows);

      if (initializedForKeyRef.current !== initKey) {
        const initial = buildInitialSelection(rows, userId);
        setSelectedIds(initial.selectedIds);
        setIsAssignedUser(initial.isAssignedUser);
        setAccordionExpanded(!initial.isAssignedUser);
        setExpandedBookIds(new Set());
        initializedForKeyRef.current = initKey;
      }
    } catch (err) {
      log.error('Failed to load prepare offline chapters', {
        error: err,
        projectId,
      });
      setError(err);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, userId]);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  const books: PrepareOfflineBookGroup[] = useMemo(
    () => groupChaptersByBook(chapters),
    [chapters],
  );

  const selectedCount = selectedIds.size;

  const toggleChapter = useCallback((chapterId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }, []);

  const toggleBook = useCallback((book: PrepareOfflineBookGroup) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = book.chapters.every(ch => next.has(ch.id));
      for (const ch of book.chapters) {
        if (allSelected) {
          next.delete(ch.id);
        } else {
          next.add(ch.id);
        }
      }
      return next;
    });
  }, []);

  const isBookFullySelected = useCallback(
    (book: PrepareOfflineBookGroup) =>
      book.chapters.length > 0 &&
      book.chapters.every(ch => selectedIds.has(ch.id)),
    [selectedIds],
  );

  const retry = useCallback(async () => {
    setLoading(true);
    await loadChapters();
  }, [loadChapters]);

  const toggleBookExpanded = useCallback((bookId: number) => {
    setExpandedBookIds(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  }, []);

  const accordionTitle = isAssignedUser
    ? `Assigned chapters (${selectedCount})`
    : `Selected chapters (${selectedCount})`;

  return {
    books,
    loading,
    error,
    selectedIds,
    selectedCount,
    isAssignedUser,
    accordionExpanded,
    setAccordionExpanded,
    expandedBookIds,
    toggleBookExpanded,
    accordionTitle,
    toggleChapter,
    toggleBook,
    isBookFullySelected,
    retry,
  };
}
