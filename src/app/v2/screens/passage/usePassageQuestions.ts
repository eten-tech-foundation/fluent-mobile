import { useMemo } from 'react';
import { useConnectivity } from '../../../../hooks/useConnectivity';
import { useResourcesInventory } from '../../../../hooks/useResourcesInventory';
import { useTranslationQuestionsForUnit } from '../../../../hooks/useTranslationQuestionsForUnit';
import type { TranslationQuestionItem } from '../../../../types/resources/translationQuestions';
import { verseRefsKey } from '../../../../utils/loadResourcesForVerseRange';
import { getInventoriedResourceSections } from '../../../../utils/resourcesSectionInventory';
import type { Ready } from './ready';

export type PassageQuestionsState =
  | { status: 'loading' }
  /** Offline, and Prepare for Offline hasn't downloaded them. */
  | { status: 'unprepared' }
  /** A whole chapter whose text isn't here yet, so its verses aren't known. */
  | { status: 'noVerses' }
  | { status: 'failed' }
  | { status: 'ready'; questions: TranslationQuestionItem[] };

/**
 * Translation Questions for the passage, or for the verse Record is on in
 * verse mode, from the same loader as Legacy's Resources tab: downloaded
 * first, the API only when online. Loads once `enabled`, and never before
 * connectivity resolves, so an unknown network isn't read as offline.
 */
export function usePassageQuestions({
  passage,
  userId,
  verse,
  enabled,
}: {
  passage: Ready;
  userId: number | null;
  /** Verse mode's place; null for the whole passage. */
  verse: number | null;
  enabled: boolean;
}) {
  const { assignment, verses } = passage;
  const { isOnline, hasResolved } = useConnectivity();
  const online = hasResolved && isOnline;
  const projectId = assignment.projectId ?? null;
  const verseRefs = useMemo(() => {
    if (verse === null) {
      return verses.map(v => ({
        chapterNumber: v.chapterNumber,
        verseNumber: v.verseNumber,
      }));
    }
    const at = verses.find(
      v =>
        v.verseNumber === verse && v.chapterNumber === assignment.chapterNumber,
    );
    return [
      {
        chapterNumber: at?.chapterNumber ?? assignment.chapterNumber,
        verseNumber: verse,
      },
    ];
  }, [verses, verse, assignment.chapterNumber]);
  const { getResourceStatus, downloadedSections } = useResourcesInventory(
    projectId,
    userId,
  );
  const prepared = getInventoriedResourceSections(
    getResourceStatus,
    downloadedSections,
  ).includes('translationQuestions');
  const languageCode = assignment.sourceLanguageCode;
  const noVerses = verseRefs.length === 0;
  const { state, retry } = useTranslationQuestionsForUnit({
    projectId: enabled && hasResolved && !noVerses ? projectId : null,
    userId,
    isOnline: online,
    bookCode: assignment.bookCode ?? '',
    chapterNumber: verseRefs[0]?.chapterNumber ?? assignment.chapterNumber,
    verseNumber: verseRefs[0]?.verseNumber ?? 1,
    verseRefs,
    languageCode,
  });

  let questions: PassageQuestionsState;
  if (noVerses) {
    questions = { status: 'noVerses' };
  } else if (!enabled || !hasResolved || state.status === 'loading') {
    questions = { status: 'loading' };
  } else if (state.status === 'error') {
    questions = { status: 'failed' };
  } else if (
    state.questions.length === 0 &&
    !online &&
    projectId !== null &&
    !prepared
  ) {
    questions = { status: 'unprepared' };
  } else {
    questions = { status: 'ready', questions: state.questions };
  }
  // Changes with whatever the questions are for, so open answers reset.
  const scope = `${projectId}:${userId}:${languageCode}:${verseRefsKey(
    verseRefs,
  )}`;
  return { state: questions, retry, scope };
}
