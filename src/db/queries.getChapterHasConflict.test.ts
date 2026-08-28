const mockExecute = jest.fn();

jest.mock('./db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(),
}));

import { getChapterHasConflict } from './queries';

describe('getChapterHasConflict', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns true when has_conflict is 1', async () => {
    mockExecute.mockResolvedValue({ rows: [{ has_conflict: 1 }] });

    await expect(getChapterHasConflict(12)).resolves.toBe(true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('has_conflict'),
      [12],
    );
  });

  it('returns false when has_conflict is 0', async () => {
    mockExecute.mockResolvedValue({ rows: [{ has_conflict: 0 }] });
    await expect(getChapterHasConflict(12)).resolves.toBe(false);
  });

  it('returns false when no row matches', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    await expect(getChapterHasConflict(999)).resolves.toBe(false);
  });

  it('returns false when the query throws', async () => {
    mockExecute.mockRejectedValue(new Error('db unavailable'));
    await expect(getChapterHasConflict(1)).resolves.toBe(false);
  });
});
