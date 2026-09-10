import { getBibleTextId, getPericopeForVerse } from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import type { DraftingUnit } from '../services/draftingUnitPreference';
import { logger } from '../utils/logger';
import type { RecordingUnitCapture } from '../utils/recordingRange';

const log = logger.create('ResolveRecordingUnit');

export type ResolveRecordingUnitArgs = {
  draftingUnit: DraftingUnit;
  projectId: number | null;
  bibleId: number;
  bookId: number;
  chapterNumber: number;
  verseNumber: number;
  selectedBibleTextId: number | null;
};

/**
 * Capture metadata for the active drafting unit (#410).
 * Missing pericope data falls back to a verse take on the selected verse.
 */
export async function resolveRecordingUnit(
  args: ResolveRecordingUnitArgs,
): Promise<RecordingUnitCapture | null> {
  const {
    draftingUnit,
    projectId,
    bibleId,
    bookId,
    chapterNumber,
    verseNumber,
    selectedBibleTextId,
  } = args;
  if (selectedBibleTextId === null) {
    log.debug('resolve skipped — no selected bible text id', {
      bookId,
      chapterNumber,
      verseNumber,
      draftingUnit,
    });
    return null;
  }

  if (
    draftingUnit === 'pericope' &&
    typeof projectId === 'number' &&
    projectId > 0
  ) {
    const setId = await getProjectPericopeSetId(projectId);
    log.debug('resolving pericope recording unit', {
      bookId,
      chapterNumber,
      verseNumber,
      projectId,
      pericopeSetId: setId,
      selectedBibleTextId,
    });
    if (setId !== null) {
      const group = await getPericopeForVerse(
        bookId,
        chapterNumber,
        verseNumber,
        setId,
      );
      if (group && group.verses.length > 0) {
        const first = group.verses[0]!;
        const last = group.verses[group.verses.length - 1]!;
        const coveredViews = (
          await Promise.all(
            group.verses.map(async v => {
              const id = await getBibleTextId(
                bibleId,
                bookId,
                v.chapterNumber,
                v.verseNumber,
              );
              return id === null
                ? null
                : {
                    bibleTextId: id,
                    chapterNumber: v.chapterNumber,
                    verseNumber: v.verseNumber,
                  };
            }),
          )
        ).filter((v): v is NonNullable<typeof v> => v !== null);
        const anchor = coveredViews[0]?.bibleTextId ?? selectedBibleTextId;
        const capture: RecordingUnitCapture = {
          granularity: 'pericope',
          startChapter: first.chapterNumber,
          startVerse: first.verseNumber,
          endChapter: last.chapterNumber,
          endVerse: last.verseNumber,
          anchorBibleTextId: anchor,
          coveredViews:
            coveredViews.length > 0
              ? coveredViews
              : [
                  {
                    bibleTextId: selectedBibleTextId,
                    chapterNumber,
                    verseNumber,
                  },
                ],
        };
        log.debug('resolved pericope recording unit', {
          bookId,
          anchorVerse: `${chapterNumber}:${verseNumber}`,
          pericopeNumber: group.pericopeNumber,
          pericopeTitle: group.pericopeTitle,
          span: `${capture.startChapter}:${capture.startVerse}-${capture.endChapter}:${capture.endVerse}`,
          verseCount: group.verses.length,
          coveredViews: capture.coveredViews,
          anchorBibleTextId: capture.anchorBibleTextId,
        });
        return capture;
      }
      log.debug('pericope lookup returned no verses — falling back to verse', {
        bookId,
        chapterNumber,
        verseNumber,
        pericopeSetId: setId,
      });
    } else {
      log.debug('project has no pericope set — falling back to verse', {
        projectId,
        bookId,
        chapterNumber,
        verseNumber,
      });
    }
  }

  const verseCapture: RecordingUnitCapture = {
    granularity: 'verse',
    startChapter: chapterNumber,
    startVerse: verseNumber,
    endChapter: chapterNumber,
    endVerse: verseNumber,
    anchorBibleTextId: selectedBibleTextId,
    coveredViews: [
      {
        bibleTextId: selectedBibleTextId,
        chapterNumber,
        verseNumber,
      },
    ],
  };
  log.debug('resolved verse recording unit', {
    bookId,
    chapterNumber,
    verseNumber,
    draftingUnit,
    anchorBibleTextId: verseCapture.anchorBibleTextId,
  });
  return verseCapture;
}
