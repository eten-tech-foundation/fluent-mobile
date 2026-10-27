import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';

const log = logger.create('usePendingDelete');
const logFailure = (error: unknown) =>
  log.error('Failed to delete take', { error });

/** How long a deleted take can be brought back (Q25). */
export const UNDO_MS = 5000;

export interface PendingDelete {
  id: string;
  takeNumber: number;
}

/**
 * Holds a delete for `ms` so it can be undone, then commits it. One at a
 * time: a second delete commits the first. Commits run in order, and
 * `commit()` resolves once every one started so far has finished. A
 * committing take stays in `hiddenIds` until its delete returns, so it
 * doesn't flash back in before the takes reload. Unmounting commits whatever
 * is pending.
 */
export function usePendingDelete(
  commitDelete: (id: string) => Promise<void>,
  ms = UNDO_MS,
) {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pendingRef = useRef<PendingDelete | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const commit = useCallback(() => {
    const target = pendingRef.current;
    if (!target) return chain.current;
    clearTimer();
    pendingRef.current = null;
    setPending(null);
    setHiddenIds(prev => new Set(prev).add(target.id));
    const unhide = () =>
      setHiddenIds(prev => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    chain.current = chain.current
      .then(() => commitRef.current(target.id))
      .catch(logFailure)
      .then(unhide);
    return chain.current;
  }, []);

  const remove = useCallback(
    (take: PendingDelete) => {
      void commit();
      pendingRef.current = take;
      setPending(take);
      timer.current = setTimeout(() => void commit(), ms);
    },
    [commit, ms],
  );

  const undo = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      const target = pendingRef.current;
      if (target) {
        void chain.current
          .then(() => commitRef.current(target.id))
          .catch(logFailure);
      }
    },
    [],
  );

  return { pending, hiddenIds, remove, undo, commit };
}
