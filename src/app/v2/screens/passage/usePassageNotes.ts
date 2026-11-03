import { useMemo, useRef } from 'react';
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
  const { state } = useTranslationNotesForUnit({
    projectId: enabled ? assignment.projectId ?? null : null,
    userId,
    isOnline: hasResolved && isOnline,
    bookCode: assignment.bookCode ?? '',
    chapterNumber: assignment.chapterNumber,
    verseNumber: verseRefs[0]?.verseNumber ?? 1,
    verseRefs,
    languageCode: assignment.sourceLanguageCode,
  });
  // A reload (e.g. coming back online) keeps the notes it had meanwhile.
  const last = useRef(NONE);
  return useMemo(() => {
    if (state.status === 'ready') {
      last.current = matchNotes(verses, state.notes);
    } else if (state.status === 'error') {
      last.current = NONE;
    }
    return last.current;
  }, [state, verses]);
}
