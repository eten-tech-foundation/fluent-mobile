import { getDatabase } from './db';
import { parseUserId } from '../utils/parseUserId';
import { isChapterFullyRecordedPericopeMode } from './queries';

jest.mock('./db', () => ({ getDatabase: jest.fn() }));
jest.mock('../utils/parseUserId', () => ({ parseUserId: jest.fn() }));
jest.mock('./repository', () => ({ ensureUserProjectMembership: jest.fn() }));
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));
const execute = jest.fn();

/** Row shape returned by the `bible_texts` query (getBibleTexts). */
const bt = (chapter_number: number, verse_number: number) => ({
  bible_id: 1,
  book_id: 2,
  chapter_number,
  verse_number,
  text: `verse ${chapter_number}:${verse_number}`,
});

const pv = (
  pericope_number: string,
  chapter_number: number,
  verse_number: number,
) => ({
  pericope_number,
  pericope_title: null,
  section: null,
  chapter_number,
  verse_number,
});

const cov = (sc: number, sv: number, ec: number, ev: number) => ({
  granularity: 'pericope',
  start_chapter: sc,
  start_verse: sv,
  end_chapter: ec,
  end_verse: ev,
  chapter_number: sc,
  verse_number: sv,
});

/** Row shape returned by the recorded-verse-numbers query (getRecordedVerseNumbers). */
const rv = (verse_number: number) => ({ verse_number });

const chapterOnePericopes = [pv('0', 1, 1), pv('0', 1, 2), pv('1', 1, 3)];
// bible_texts rows matching every verse chapterOnePericopes covers (1, 2, 3)
// — so there are no "ungrouped" verses outside a pericope in these fixtures.
const chapterOneFullyGrouped = [bt(1, 1), bt(1, 2), bt(1, 3)];

describe('isChapterFullyRecordedPericopeMode (#542)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockReturnValue({ execute });
    (parseUserId as jest.Mock).mockReturnValue(7);
  });

  it('is true when every pericope has an exact full-range take', async () => {
    execute
      .mockResolvedValueOnce({ rows: chapterOneFullyGrouped }) // getBibleTexts
      .mockResolvedValueOnce({ rows: chapterOnePericopes }) // getPericopesForChapter
      .mockResolvedValueOnce({ rows: [cov(1, 1, 1, 2), cov(1, 3, 1, 3)] }); // getSelectedTakeCoverages
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      true,
    );
  });

  it('is false when one pericope has no take', async () => {
    execute
      .mockResolvedValueOnce({ rows: chapterOneFullyGrouped })
      .mockResolvedValueOnce({ rows: chapterOnePericopes })
      .mockResolvedValueOnce({ rows: [cov(1, 1, 1, 2)] });
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
  });

  it('is false when the chapter has no verses, without querying pericopes or coverages', async () => {
    execute.mockResolvedValueOnce({ rows: [] }); // getBibleTexts: no verses at all
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  describe('ungrouped verses (a pericope set that does not cover every chapter verse)', () => {
    it('falls back to per-verse completeness when no pericope covers the chapter', async () => {
      execute
        .mockResolvedValueOnce({ rows: [bt(1, 1), bt(1, 2)] }) // getBibleTexts
        .mockResolvedValueOnce({ rows: [] }) // getPericopesForChapter: none
        .mockResolvedValueOnce({ rows: [] }) // getSelectedTakeCoverages: irrelevant, vacuously complete
        .mockResolvedValueOnce({ rows: [rv(1), rv(2)] }); // getRecordedVerseNumbers: both recorded
      await expect(
        isChapterFullyRecordedPericopeMode(1, 2, 1, 7),
      ).resolves.toBe(true);
    });

    it('is false when an ungrouped verse has no selected recording', async () => {
      execute
        .mockResolvedValueOnce({ rows: [bt(1, 1), bt(1, 2)] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [rv(1)] }); // verse 2 missing
      await expect(
        isChapterFullyRecordedPericopeMode(1, 2, 1, 7),
      ).resolves.toBe(false);
    });

    it('requires both grouped pericopes and ungrouped verses to be complete', async () => {
      // Verse 4 sits outside the chapter's one pericope (verses 1-3).
      execute
        .mockResolvedValueOnce({
          rows: [bt(1, 1), bt(1, 2), bt(1, 3), bt(1, 4)],
        })
        .mockResolvedValueOnce({ rows: chapterOnePericopes })
        .mockResolvedValueOnce({ rows: [cov(1, 1, 1, 2), cov(1, 3, 1, 3)] }) // pericopes fully covered
        .mockResolvedValueOnce({ rows: [] }); // verse 4 not recorded
      await expect(
        isChapterFullyRecordedPericopeMode(1, 2, 1, 7),
      ).resolves.toBe(false);
    });
  });

  describe('cross-chapter pericope (1:25–2:3), viewed from chapter 1', () => {
    const rows = [
      pv('5', 1, 25),
      pv('5', 1, 26),
      pv('5', 2, 1),
      pv('5', 2, 2),
      pv('5', 2, 3),
    ];
    // Only chapter 1's own verses come back from getBibleTexts(chapterNumber=1).
    const chapterOneVerses = [bt(1, 25), bt(1, 26)];

    it('is true only when the take spans the whole range', async () => {
      execute
        .mockResolvedValueOnce({ rows: chapterOneVerses })
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [cov(1, 25, 2, 3)] });
      await expect(
        isChapterFullyRecordedPericopeMode(1, 2, 1, 7),
      ).resolves.toBe(true);
    });

    it.each([
      ['ends short of the last verse', cov(1, 25, 2, 2)],
      ['covers only the in-chapter part', cov(1, 25, 1, 26)],
      ['starts late', cov(1, 26, 2, 3)],
    ])('is false when the take %s', async (_label, coverage) => {
      execute
        .mockResolvedValueOnce({ rows: chapterOneVerses })
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [coverage] });
      await expect(
        isChapterFullyRecordedPericopeMode(1, 2, 1, 7),
      ).resolves.toBe(false);
    });
  });

  it('treats a legacy single-verse take (no start/end range) as covering its verse', async () => {
    const legacy = {
      granularity: 'verse',
      start_chapter: 0,
      start_verse: 0,
      end_chapter: 0,
      end_verse: 0,
      chapter_number: 1,
      verse_number: 3,
    };
    execute
      .mockResolvedValueOnce({ rows: chapterOneFullyGrouped })
      .mockResolvedValueOnce({ rows: chapterOnePericopes })
      .mockResolvedValueOnce({ rows: [cov(1, 1, 1, 2), legacy] });
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      true,
    );
  });

  it('is false when the bible-text query fails', async () => {
    // getBibleTexts catches its own errors and returns [] — chapterVerses.length
    // === 0 short-circuits before pericopes/coverages are ever queried.
    execute.mockRejectedValueOnce(new Error('db down'));
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('is false when the pericope query fails (treated as no pericope coverage)', async () => {
    // getPericopesForChapter also catches its own errors and returns [] —
    // every chapter verse becomes "ungrouped" and must clear the per-verse
    // recorded check instead.
    execute
      .mockResolvedValueOnce({ rows: chapterOneFullyGrouped }) // getBibleTexts
      .mockRejectedValueOnce(new Error('db down')) // getPericopesForChapter
      .mockResolvedValueOnce({ rows: [] }) // getSelectedTakeCoverages
      .mockResolvedValueOnce({ rows: [] }); // getRecordedVerseNumbers: nothing recorded
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
  });

  it('is false when the coverage query fails', async () => {
    execute
      .mockResolvedValueOnce({ rows: chapterOneFullyGrouped })
      .mockResolvedValueOnce({ rows: chapterOnePericopes })
      .mockRejectedValueOnce(new Error('db down')); // getSelectedTakeCoverages
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
  });
});
