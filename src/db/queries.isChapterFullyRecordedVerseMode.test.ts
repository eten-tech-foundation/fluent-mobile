import { getDatabase } from './db';
import { parseUserId } from '../utils/parseUserId';
import { isChapterFullyRecordedVerseMode } from './queries';

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

describe('isChapterFullyRecordedVerseMode (#542)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockReturnValue({ execute });
    (parseUserId as jest.Mock).mockReturnValue(7);
  });

  it.each([
    ['every verse recorded', { total: 3, recorded: 3 }, true],
    ['partial verse recording', { total: 3, recorded: 2 }, false],
    ['no verses recorded', { total: 3, recorded: 0 }, false],
    ['empty chapter (no bible_texts rows)', { total: 0, recorded: 0 }, false],
    ['numeric strings from the driver', { total: '3', recorded: '3' }, true],
  ])('%s', async (_label, row, expected) => {
    execute.mockResolvedValueOnce({ rows: [row] });
    await expect(isChapterFullyRecordedVerseMode(1, 2, 3)).resolves.toBe(
      expected,
    );
  });

  it('returns false when the query returns no rows', async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(isChapterFullyRecordedVerseMode(1, 2, 3)).resolves.toBe(false);
  });

  it('returns false when the query throws', async () => {
    execute.mockRejectedValueOnce(new Error('db down'));
    await expect(isChapterFullyRecordedVerseMode(1, 2, 3)).resolves.toBe(false);
  });

  it('scopes the recording join to the active user', async () => {
    execute.mockResolvedValueOnce({ rows: [{ total: 1, recorded: 1 }] });
    await isChapterFullyRecordedVerseMode(1, 2, 3);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('recorded_by_user_id = ?');
    expect(params).toEqual([7, 1, 2, 3]);
  });

  it('uses IS NULL when there is no active user', async () => {
    (parseUserId as jest.Mock).mockReturnValue(null);
    execute.mockResolvedValueOnce({ rows: [{ total: 1, recorded: 1 }] });
    await isChapterFullyRecordedVerseMode(1, 2, 3);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('recorded_by_user_id IS NULL');
    expect(params).toEqual([1, 2, 3]);
  });
});
