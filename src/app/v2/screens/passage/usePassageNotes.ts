import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useConnectivity } from '../../../../hooks/useConnectivity';
import { useTranslationNotesForUnit } from '../../../../hooks/useTranslationNotesForUnit';
import {
  passageResourceEpoch,
  subscribePassageResourceClears,
} from '../../../../services/passageResourceReuse';
import { verseRefsKey } from '../../../../utils/loadResourcesForVerseRange';
import { matchNotes, type NoteChips, type PassageNote } from './noteMatch';
import type { Ready } from './ready';

const NONE: { notes: PassageNote[]; chips: NoteChips } = {
  notes: [],
  chips: new Map(),
};

/**
 * What the notes load came to, for the player to say. `partial` and
 * `failed` can sit beside notes kept from an earlier load of this passage.
 */
export type PassageNotesStatus =
  /** Not asked for yet: the player hasn't opened. */
  | 'idle'
  | 'loading'
  /** Loading again after Retry. */
  | 'retrying'
  /** Loaded, and the passage has no notes. */
  | 'empty'
  | 'complete'
  /** Some verses failed; Retry asks for just those. */
  | 'partial'
  /** Offline, and some verses have nothing downloaded. */
  | 'offline'
  | 'failed';

/**
 * The passage's translation notes, from the same loader as Legacy's
 * Resources tab (downloaded first, the API only when online), each placed on
 * its phrase in the script where it can be found. Loads once `enabled`, so
 * the fetch stays out of the screen's arrival.
 */
export function usePassageNotes(
  passage: Ready,
  userId: number | null,
  enabled: boolean,
) {
  const { assignment, verses } = passage;
  const { isOnline, hasResolved } = useConnectivity();
  const verseRefs = useMemo(
    () =>
      verses.map(v => ({
        chapterNumber: v.chapterNumber,
        verseNumber: v.verseNumber,
      })),
    [verses],
  );
  const languageCode = assignment.sourceLanguageCode;
  const owner = userId === null ? '' : String(userId);
  const epoch = useSyncExternalStore(subscribePassageResourceClears, () =>
    passageResourceEpoch(owner),
  );
  const projectId = enabled ? assignment.projectId ?? null : null;
  const bookCode = assignment.bookCode ?? '';
  const online = hasResolved && isOnline;
  const { state, retry } = useTranslationNotesForUnit({
    projectId,
    userId,
    isOnline: online,
    bookCode,
    chapterNumber: assignment.chapterNumber,
    verseNumber: verseRefs[0]?.verseNumber ?? 1,
    verseRefs,
    languageCode,
  });
  const ready = state.status === 'ready' ? state.notes : null;
  const settled = useMemo(
    () => (ready ? matchNotes(verses, ready) : null),
    [ready, verses],
  );
  // A reload keeps the notes it already had, including after a failed one,
  // for this account, passage and language. A grant clear bumps the epoch,
  // and those notes are not carried across it.
  const identity = JSON.stringify([
    userId,
    assignment.projectId ?? null,
    bookCode,
    verseRefsKey(verseRefs),
    languageCode ?? null,
    epoch,
  ]);
  const [kept, setKept] = useState({ identity, notes: NONE });
  useEffect(() => {
    if (settled) setKept({ identity, notes: settled });
  }, [settled, identity]);
  const notes = settled ?? (kept.identity === identity ? kept.notes : NONE);

  // Retry is one load at a time, and only says so for this passage. The ref
  // holds off a second tap in the same frame, before `loading` re-renders.
  const [retryingFor, setRetryingFor] = useState<string | null>(null);
  const retryingRef = useRef(false);
  const loading = state.status === 'loading';
  useEffect(() => {
    if (loading) return;
    retryingRef.current = false;
    setRetryingFor(null);
  }, [loading]);
  useEffect(() => setRetryingFor(null), [identity]);
  const retryNotes = useCallback(() => {
    if (loading || retryingRef.current || projectId === null) return;
    retryingRef.current = true;
    setRetryingFor(identity);
    void retry();
  }, [loading, projectId, identity, retry]);

  let status: PassageNotesStatus;
  if (projectId === null) status = 'idle';
  // Before connectivity is known the load runs offline; don't call that out.
  else if (loading || !hasResolved) {
    status = retryingFor === identity ? 'retrying' : 'loading';
  } else if (state.status === 'error') status = 'failed';
  else if (state.failedRefs.length > 0) status = 'partial';
  else if (!online && state.unavailableOfflineRefs.length > 0) {
    status = 'offline';
  } else if (state.notes.length === 0) status = 'empty';
  else status = 'complete';

  return useMemo(
    () => ({ ...notes, status, retry: retryNotes }),
    [notes, status, retryNotes],
  );
}
