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

import { getPendingChapterClaims } from './queries';

describe('getPendingChapterClaims', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('returns pending chapter claim rows ordered by claimed_at', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        {
          id: 1,
          chapter_assignment_id: 10,
          user_id: 9,
          claimed_at: '2026-08-28T00:00:00.000Z',
        },
        {
          id: 2,
          chapter_assignment_id: 11,
          user_id: 9,
          claimed_at: '2026-08-28T00:00:01.000Z',
        },
      ],
    });

    await expect(getPendingChapterClaims()).resolves.toEqual([
      {
        id: 1,
        chapterAssignmentId: 10,
        userId: 9,
        claimedAt: '2026-08-28T00:00:00.000Z',
      },
      {
        id: 2,
        chapterAssignmentId: 11,
        userId: 9,
        claimedAt: '2026-08-28T00:00:01.000Z',
      },
    ]);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("sync_status = 'pending'"),
    );
  });

  it('returns an empty array when the query throws', async () => {
    mockExecute.mockRejectedValue(new Error('db unavailable'));
    await expect(getPendingChapterClaims()).resolves.toEqual([]);
  });
});
