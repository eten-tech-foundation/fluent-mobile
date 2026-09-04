const mockClaimChapterAssignment = jest.fn();
const mockSetChapterAssignmentConflict = jest.fn();
const mockResolveChapterClaimQueueEntry = jest.fn();
const mockGetPendingChapterClaims = jest.fn();
const mockFluentClaim = jest.fn();

jest.mock('./api', () => ({
  FluentAPI: {
    claimChapterAssignment: (...args: unknown[]) => mockFluentClaim(...args),
  },
}));

jest.mock('../db/repository', () => ({
  claimChapterAssignment: (...args: unknown[]) =>
    mockClaimChapterAssignment(...args),
  setChapterAssignmentConflict: (...args: unknown[]) =>
    mockSetChapterAssignmentConflict(...args),
  resolveChapterClaimQueueEntry: (...args: unknown[]) =>
    mockResolveChapterClaimQueueEntry(...args),
}));

jest.mock('../db/queries', () => ({
  getPendingChapterClaims: (...args: unknown[]) =>
    mockGetPendingChapterClaims(...args),
}));

import { syncChapterClaim, syncPendingChapterClaims } from './chapterClaimSync';

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
    mockSetChapterAssignmentConflict.mockResolvedValue(undefined);
  });

  it('calls API and writes local assignment on a winning claim', async () => {
    await expect(syncChapterClaim(3, 9)).resolves.toEqual(winningResponse);
    expect(mockFluentClaim).toHaveBeenCalledWith(3, 9);
    expect(mockClaimChapterAssignment).toHaveBeenCalledWith(3, 9);
    expect(mockSetChapterAssignmentConflict).not.toHaveBeenCalled();
  });

  it('persists has_conflict locally when the API reports a claim conflict', async () => {
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
    expect(mockSetChapterAssignmentConflict).toHaveBeenCalledWith(3, true);
  });
});

describe('syncPendingChapterClaims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveChapterClaimQueueEntry.mockResolvedValue(undefined);
    mockGetPendingChapterClaims.mockResolvedValue([]);
  });

  it('syncs a winning pending claim and resolves the queue row', async () => {
    mockGetPendingChapterClaims.mockResolvedValue([
      {
        id: 1,
        chapterAssignmentId: 10,
        userId: 9,
        claimedAt: '2026-08-28T00:00:00.000Z',
      },
    ]);
    mockFluentClaim.mockResolvedValue({
      chapterAssignmentId: 10,
      assignedUserId: 9,
      status: 'draft',
      hasClaimConflict: false,
    });

    await expect(syncPendingChapterClaims(9)).resolves.toEqual({
      synced: 1,
      conflicts: 0,
      failed: 0,
    });
    expect(mockResolveChapterClaimQueueEntry).toHaveBeenCalledWith(1);
  });

  it('counts conflicts, persists them, and resolves the queue row', async () => {
    mockGetPendingChapterClaims.mockResolvedValue([
      {
        id: 2,
        chapterAssignmentId: 11,
        userId: 9,
        claimedAt: '2026-08-28T00:00:00.000Z',
      },
    ]);
    mockFluentClaim.mockResolvedValue({
      chapterAssignmentId: 11,
      assignedUserId: 99,
      status: 'draft',
      hasClaimConflict: true,
    });

    await expect(syncPendingChapterClaims(9)).resolves.toEqual({
      synced: 0,
      conflicts: 1,
      failed: 0,
    });
    expect(mockSetChapterAssignmentConflict).toHaveBeenCalledWith(11, true);
    expect(mockResolveChapterClaimQueueEntry).toHaveBeenCalledWith(2);
  });

  it('leaves the queue row pending on transient API failure', async () => {
    mockGetPendingChapterClaims.mockResolvedValue([
      {
        id: 3,
        chapterAssignmentId: 12,
        userId: 9,
        claimedAt: '2026-08-28T00:00:00.000Z',
      },
    ]);
    mockFluentClaim.mockRejectedValue(new Error('network'));

    await expect(syncPendingChapterClaims(9)).resolves.toEqual({
      synced: 0,
      conflicts: 0,
      failed: 1,
    });
    expect(mockResolveChapterClaimQueueEntry).not.toHaveBeenCalled();
  });

  it('skips pending rows for other users', async () => {
    mockGetPendingChapterClaims.mockResolvedValue([
      {
        id: 4,
        chapterAssignmentId: 13,
        userId: 42,
        claimedAt: '2026-08-28T00:00:00.000Z',
      },
    ]);

    await expect(syncPendingChapterClaims(9)).resolves.toEqual({
      synced: 0,
      conflicts: 0,
      failed: 0,
    });
    expect(mockFluentClaim).not.toHaveBeenCalled();
    expect(mockResolveChapterClaimQueueEntry).not.toHaveBeenCalled();
  });

  it('isolates per-row failures so one error does not abort the rest', async () => {
    mockGetPendingChapterClaims.mockResolvedValue([
      {
        id: 5,
        chapterAssignmentId: 14,
        userId: 9,
        claimedAt: '2026-08-28T00:00:00.000Z',
      },
      {
        id: 6,
        chapterAssignmentId: 15,
        userId: 9,
        claimedAt: '2026-08-28T00:00:01.000Z',
      },
    ]);
    mockFluentClaim
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        chapterAssignmentId: 15,
        assignedUserId: 9,
        status: 'draft',
        hasClaimConflict: false,
      });

    await expect(syncPendingChapterClaims(9)).resolves.toEqual({
      synced: 1,
      conflicts: 0,
      failed: 1,
    });
    expect(mockResolveChapterClaimQueueEntry).toHaveBeenCalledTimes(1);
    expect(mockResolveChapterClaimQueueEntry).toHaveBeenCalledWith(6);
  });
});
