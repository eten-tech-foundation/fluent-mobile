import { getDatabase } from './db';
import { parseUserId } from '../utils/parseUserId';
import {
  getRecordedVerseNumbers,
  getSelectedTakeCoverages,
  isChapterFullyRecordedPericopeMode,
  RECORDINGS_JOIN_CA,
} from './queries';

jest.mock('./db', () => ({ getDatabase: jest.fn() }));
jest.mock('../utils/parseUserId', () => ({ parseUserId: jest.fn() }));
jest.mock('./repository', () => ({ ensureUserProjectMembership: jest.fn() }));
jest.mock('../services/storage', () => ({
  getActiveUserId: () => '7',
  getUserIdSync: () => '7',
}));
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
const UNIT_PREDICATE = '(r.project_unit_id IS NULL OR r.project_unit_id = ?)';

describe('recording project-unit scoping (#613)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockReturnValue({ execute });
    (parseUserId as jest.Mock).mockReturnValue(7);
  });

  describe('RECORDINGS_JOIN_CA', () => {
    it("only joins takes from the assignment's unit or legacy NULL rows", () => {
      expect(RECORDINGS_JOIN_CA).toContain(
        '(r.project_unit_id IS NULL OR r.project_unit_id = ca.project_unit_id)',
      );
      // Predicate adds no bound parameter: recorded_by_user_id stays the only `?`.
      expect(RECORDINGS_JOIN_CA.match(/\?/g)).toHaveLength(1);
    });
  });

  describe('getRecordedVerseNumbers', () => {
    it('scopes to the chapter unit or NULL and binds it after the user', async () => {
      execute.mockResolvedValueOnce({ rows: [{ verse_number: 1 }] });
      const result = await getRecordedVerseNumbers(1, 2, 3, 473);
      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain(UNIT_PREDICATE);
      expect(params).toEqual([1, 2, 3, 7, 473]);
      expect(result).toEqual(new Set([1]));
    });

    it('binds the unit directly after the chapter when there is no active user', async () => {
      (parseUserId as jest.Mock).mockReturnValue(null);
      execute.mockResolvedValueOnce({ rows: [] });
      await getRecordedVerseNumbers(1, 2, 3, 12);
      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain('recorded_by_user_id IS NULL');
      expect(sql).toContain(UNIT_PREDICATE);
      expect(params).toEqual([1, 2, 3, 12]);
    });

    it('leaves the query unscoped when the unit is unknown', async () => {
      execute.mockResolvedValueOnce({ rows: [] });
      await getRecordedVerseNumbers(1, 2, 3);
      const [sql, params] = execute.mock.calls[0];
      expect(sql).not.toContain('project_unit_id');
      expect(params).toEqual([1, 2, 3, 7]);
    });
  });

  describe('getSelectedTakeCoverages', () => {
    it('scopes to the chapter unit or NULL', async () => {
      execute.mockResolvedValueOnce({ rows: [] });
      await getSelectedTakeCoverages(1, 2, 473);
      const [sql, params] = execute.mock.calls[0];
      expect(sql).toContain(UNIT_PREDICATE);
      expect(params).toEqual([1, 2, 7, 473]);
    });

    it('leaves the query unscoped when the unit is unknown', async () => {
      execute.mockResolvedValueOnce({ rows: [] });
      await getSelectedTakeCoverages(1, 2);
      const [sql, params] = execute.mock.calls[0];
      expect(sql).not.toContain('project_unit_id');
      expect(params).toEqual([1, 2, 7]);
    });
  });

  describe('isChapterFullyRecordedPericopeMode', () => {
    it('passes the unit to coverage and ungrouped-verse queries', async () => {
      execute
        .mockResolvedValueOnce({
          rows: [
            { bible_id: 1, book_id: 2, chapter_number: 1, verse_number: 1 },
            { bible_id: 1, book_id: 2, chapter_number: 1, verse_number: 2 },
          ],
        }) // getBibleTexts
        .mockResolvedValueOnce({ rows: [] }) // getPericopesForChapter
        .mockResolvedValueOnce({ rows: [] }) // getSelectedTakeCoverages
        .mockResolvedValueOnce({
          rows: [{ verse_number: 1 }, { verse_number: 2 }],
        }); // getRecordedVerseNumbers

      await expect(
        isChapterFullyRecordedPericopeMode(1, 2, 1, 7, 473),
      ).resolves.toBe(true);

      const coverageCall = execute.mock.calls[2];
      expect(coverageCall[0]).toContain(UNIT_PREDICATE);
      expect(coverageCall[1]).toEqual([1, 2, 7, 473]);
      const recordedCall = execute.mock.calls[3];
      expect(recordedCall[0]).toContain(UNIT_PREDICATE);
      expect(recordedCall[1]).toEqual([1, 2, 1, 7, 473]);
    });
  });
});
