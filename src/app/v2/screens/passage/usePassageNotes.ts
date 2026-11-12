import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useConnectivity } from '../../../../hooks/useConnectivity';
import { useTranslationNotesForUnit } from '../../../../hooks/useTranslationNotesForUnit';
import {
  passageResourceEpoch,
  subscribePassageResourceClears,
} from '../../../../services/passageResourceReuse';
import { matchNotes, type NoteChips, type PassageNote } from './noteMatch';
import type { Ready } from './ready';

const NONE: { notes: PassageNote[]; chips: NoteChips } = {
  notes: [],
  chips: new Map(),
};

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
  const { state, retry } = useTranslationNotesForUnit({
    projectId: enabled ? assignment.projectId ?? null : null,
    userId,
    isOnline: hasResolved && isOnline,
    bookCode: assignment.bookCode ?? '',
    chapterNumber: assignment.chapterNumber,
    verseNumber: verseRefs[0]?.verseNumber ?? 1,
    verseRefs,
    languageCode,
  });
  const ready = state.status === 'ready' ? state.notes : null;
  const failed = state.status === 'error';
  const settled = useMemo(
    () => (ready ? matchNotes(verses, ready) : null),
    [ready, verses],
  );
  // A reload keeps the notes it already had, including after a failed one,
  // for this account and language. A grant clear bumps the epoch, and those
  // notes are not carried across it.
  const [kept, setKept] = useState({
    userId,
    languageCode,
    epoch,
    notes: NONE,
  });
  useEffect(() => {
    if (settled) setKept({ userId, languageCode, epoch, notes: settled });
  }, [settled, userId, languageCode, epoch]);
  const notes =
    settled ??
    (kept.userId === userId &&
    kept.languageCode === languageCode &&
    kept.epoch === epoch
      ? kept.notes
      : NONE);
  return useMemo(() => ({ ...notes, failed, retry }), [notes, failed, retry]);
}
