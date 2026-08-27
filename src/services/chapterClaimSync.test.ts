const mockClaimChapterAssignment = jest.fn();
const mockFluentClaim = jest.fn();

jest.mock('./api', () => ({
  FluentAPI: {
    claimChapterAssignment: (...args: unknown[]) => mockFluentClaim(...args),
  },
}));

jest.mock('../db/repository', () => ({
  claimChapterAssignment: (...args: unknown[]) =>
    mockClaimChapterAssignment(...args),
}));

import { syncChapterClaim } from './chapterClaimSync';

describe('syncChapterClaim', () => {
  const winningResponse = {
    chapterAssignmentId: 3,
    assignedUserId: 9,
    status: 'draft',
    hasClaimConflict: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFluentClaim.mockResolvedValue(winningResponse);
    mockClaimChapterAssignment.mockResolvedValue(undefined);
  });

  it('calls API and writes local assignment on a winning claim', async () => {
    await expect(syncChapterClaim(3, 9)).resolves.toEqual(winningResponse);
    expect(mockFluentClaim).toHaveBeenCalledWith(3, 9);
    expect(mockClaimChapterAssignment).toHaveBeenCalledWith(3, 9);
  });

  it('does not write locally when the API reports a claim conflict (#271 deferred)', async () => {
    mockFluentClaim.mockResolvedValue({
      ...winningResponse,
      assignedUserId: 99,
      hasClaimConflict: true,
    });

    await expect(syncChapterClaim(3, 9)).resolves.toEqual({
      ...winningResponse,
      assignedUserId: 99,
      hasClaimConflict: true,
    });
    expect(mockClaimChapterAssignment).not.toHaveBeenCalled();
  });
});
