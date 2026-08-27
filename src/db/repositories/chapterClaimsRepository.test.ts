const mockExecute = jest.fn();
const mockTxExecute = jest.fn();

jest.mock('../db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
    transaction: async (
      cb: (tx: { execute: typeof mockTxExecute }) => Promise<void>,
    ) => cb({ execute: mockTxExecute }),
  }),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import {
  getChapterAssignmentById,
  claimChapterOffline,
} from './chapterClaimsRepository';

describe('chapterClaimsRepository', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockTxExecute.mockReset();
  });

  describe('getChapterAssignmentById', () => {
    it('maps assigned_user_id to assignedUserId', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ chapter_assignment_id: 1, assigned_user_id: 10 }],
      });

      const result = await getChapterAssignmentById(1);

      expect(result).toEqual({
        chapterAssignmentId: 1,
        assignedUserId: 10,
      });
    });

    it('returns null assignedUserId when the row has no assignee', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ chapter_assignment_id: 1, assigned_user_id: null }],
      });

      const result = await getChapterAssignmentById(1);

      expect(result?.assignedUserId).toBeNull();
    });

    it('returns null when no row matches', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      expect(await getChapterAssignmentById(999)).toBeNull();
    });
  });

  describe('claimChapterOffline', () => {
    it('returns false and performs no writes when the chapter assignment does not exist', async () => {
      mockExecute.mockResolvedValue({ rows: [] });

      const result = await claimChapterOffline(1, 42);

      expect(result).toBe(false);
      expect(mockTxExecute).not.toHaveBeenCalled();
    });

    it('returns false and performs no writes when the chapter is already assigned', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ chapter_assignment_id: 1, assigned_user_id: 99 }],
      });

      const result = await claimChapterOffline(1, 42);

      expect(result).toBe(false);
      expect(mockTxExecute).not.toHaveBeenCalled();
    });

    it('claims the chapter and enqueues it when unassigned', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ chapter_assignment_id: 1, assigned_user_id: null }],
      });
      mockTxExecute
        .mockResolvedValueOnce({ rowsAffected: 1 }) // UPDATE chapter_assignments
        .mockResolvedValueOnce({ rowsAffected: 1 }); // INSERT chapter_claim_queue

      const result = await claimChapterOffline(1, 42);

      expect(result).toBe(true);
      expect(mockTxExecute).toHaveBeenCalledTimes(2);
      expect(mockTxExecute.mock.calls[0]?.[0]).toContain(
        'UPDATE chapter_assignments',
      );
      expect(mockTxExecute.mock.calls[0]?.[1]).toEqual([42, 1]);
      expect(mockTxExecute.mock.calls[1]?.[0]).toContain(
        'INSERT INTO chapter_claim_queue',
      );
      // sync_status is inlined as 'pending' in the SQL, not a bound param,
      // so only 3 bound params (chapterAssignmentId, userId, claimedAt).
      expect(mockTxExecute.mock.calls[1]?.[1]).toEqual([
        1,
        42,
        expect.any(String),
      ]);
    });

    it('does not enqueue when the guarded UPDATE affects zero rows (lost the race)', async () => {
      mockExecute.mockResolvedValue({
        rows: [{ chapter_assignment_id: 1, assigned_user_id: null }],
      });
      mockTxExecute.mockResolvedValueOnce({ rowsAffected: 0 });

      const result = await claimChapterOffline(1, 42);

      expect(result).toBe(false);
      expect(mockTxExecute).toHaveBeenCalledTimes(1);
    });
  });
});
