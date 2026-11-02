import {
  buildManifestContexts,
  MAX_CHAPTERS_PER_MANIFEST_CALL,
} from './buildManifestContexts';
import type { PrepareOfflineChapterRow } from '../types/prepareOffline/types';

function chapter(
  id: number,
  chapterNumber: number,
  bookCode = 'MAT',
  bookId = 40,
): PrepareOfflineChapterRow {
  return {
    id,
    chapterNumber,
    bibleId: 167,
    bookId,
    bookCode,
    bookName: bookCode,
    assignedUserId: null,
  };
}

describe('buildManifestContexts', () => {
  it('keeps contiguous max-20 canonical contexts (not single-chapter network splits)', () => {
    expect(MAX_CHAPTERS_PER_MANIFEST_CALL).toBe(20);
    const chapters = Array.from({ length: 28 }, (_, i) =>
      chapter(i + 1, i + 1),
    );
    const contexts = buildManifestContexts(
      chapters,
      new Set(chapters.map(ch => ch.id)),
      'eng',
    );
    expect(contexts).toEqual([
      {
        languageCode: 'eng',
        bookCode: 'MAT',
        bookId: 40,
        startChapter: 1,
        endChapter: 20,
        bibleId: 167,
      },
      {
        languageCode: 'eng',
        bookCode: 'MAT',
        bookId: 40,
        startChapter: 21,
        endChapter: 28,
        bibleId: 167,
      },
    ]);
  });

  it('does not span gaps and covers every selected chapter', () => {
    const chapters = [
      chapter(1, 1),
      chapter(2, 2),
      chapter(3, 3),
      chapter(4, 5), // gap — must not span 4
      chapter(5, 11, 'PSA', 19),
    ];
    const contexts = buildManifestContexts(
      chapters,
      new Set([1, 2, 3, 4, 5]),
      'eng',
    );
    expect(
      contexts.map(
        ctx => `${ctx.bookCode}:${ctx.startChapter}-${ctx.endChapter}`,
      ),
    ).toEqual(['MAT:1-3', 'MAT:5-5', 'PSA:11-11']);
  });
});
