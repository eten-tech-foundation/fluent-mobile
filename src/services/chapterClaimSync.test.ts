const mockClaimChapterAssignment = jest.fn();

jest.mock('./api', () => ({
  FluentAPI: {
    claimChapterAssignment: (...args: unknown[]) =>
      mockClaimChapterAssignment(...args),
  },
}));

import { syncChapterClaim } from './chapterClaimSync';

describe('syncChapterClaim', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClaimChapterAssignment.mockResolvedValue({
      chapterAssignmentId: 3,
      assignedUserId: 9,
      status: 'draft',
      hasClaimConflict: false,
    });
  });

  it('delegates to FluentAPI.claimChapterAssignment and resolves ok', async () => {
    await expect(syncChapterClaim(3, 9)).resolves.toEqual({ ok: true });
    expect(mockClaimChapterAssignment).toHaveBeenCalledWith(3, 9);
  });
});
