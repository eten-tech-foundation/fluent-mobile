import { useEffect, useMemo, useState } from 'react';
import { useConnectivity } from '../../../../hooks/useConnectivity';
import { useTranslationNotesForUnit } from '../../../../hooks/useTranslationNotesForUnit';
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
  // A reload (e.g. coming back online) keeps the notes it had meanwhile, and
  // after a failed one, as long as they're in the same language.
  const [kept, setKept] = useState({ languageCode, notes: NONE });
  useEffect(() => {
    if (settled) setKept({ languageCode, notes: settled });
  }, [settled, languageCode]);
  const notes =
    settled ?? (kept.languageCode === languageCode ? kept.notes : NONE);
  return useMemo(() => ({ ...notes, failed, retry }), [notes, failed, retry]);
}
