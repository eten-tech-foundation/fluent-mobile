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

const chapterOnePericopes = [pv('0', 1, 1), pv('0', 1, 2), pv('1', 1, 3)];

describe('isChapterFullyRecordedPericopeMode (#542)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockReturnValue({ execute });
    (parseUserId as jest.Mock).mockReturnValue(7);
  });

  it('is true when every pericope has an exact full-range take', async () => {
    execute
      .mockResolvedValueOnce({ rows: chapterOnePericopes })
      .mockResolvedValueOnce({ rows: [cov(1, 1, 1, 2), cov(1, 3, 1, 3)] });
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      true,
    );
  });

  it('is false when one pericope has no take', async () => {
    execute
      .mockResolvedValueOnce({ rows: chapterOnePericopes })
      .mockResolvedValueOnce({ rows: [cov(1, 1, 1, 2)] });
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
  });

  it('is false for an empty pericope set, without querying coverages', async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  describe('cross-chapter pericope (1:25–2:3), viewed from chapter 1', () => {
    const rows = [
      pv('5', 1, 25),
      pv('5', 1, 26),
      pv('5', 2, 1),
      pv('5', 2, 2),
      pv('5', 2, 3),
    ];

    it('is true only when the take spans the whole range', async () => {
      execute
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
      .mockResolvedValueOnce({ rows: chapterOnePericopes })
      .mockResolvedValueOnce({ rows: [cov(1, 1, 1, 2), legacy] });
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      true,
    );
  });

  it('is false when the pericope query fails', async () => {
    execute.mockRejectedValueOnce(new Error('db down'));
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
  });

  it('is false when the coverage query fails', async () => {
    execute
      .mockResolvedValueOnce({ rows: chapterOnePericopes })
      .mockRejectedValueOnce(new Error('db down'));
    await expect(isChapterFullyRecordedPericopeMode(1, 2, 1, 7)).resolves.toBe(
      false,
    );
  });
});
