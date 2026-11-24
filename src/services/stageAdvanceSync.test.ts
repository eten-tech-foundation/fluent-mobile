jest.mock('./api', () => ({
  FluentAPI: {
    getChapterAssignment: jest.fn(),
    submitChapterAssignment: jest.fn(),
  },
}));

jest.mock('../db/stageAdvanceQueueRepository', () => ({
  getPendingStageAdvances: jest.fn(),
  deleteStageAdvanceQueueEntry: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  setChapterAssignmentStatus: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  assignmentHasPendingUploads: jest.fn(),
}));

import { FluentAPI } from './api';
import {
  deleteStageAdvanceQueueEntry,
  getPendingStageAdvances,
} from '../db/stageAdvanceQueueRepository';
import { assignmentHasPendingUploads } from '../db/queries';
import { setChapterAssignmentStatus } from '../db/repository';
import { ApiError } from '../types/api/errors';
import {
  __resetStageAdvanceSyncForTests,
  drainStageAdvancesForAccounts,
  syncPendingStageAdvances,
} from './stageAdvanceSync';
import { AuthError } from './authError';

const getAssignment = jest.mocked(FluentAPI.getChapterAssignment);
const submitAssignment = jest.mocked(FluentAPI.submitChapterAssignment);
const listPending = jest.mocked(getPendingStageAdvances);
const deleteRow = jest.mocked(deleteStageAdvanceQueueEntry);
const setStatus = jest.mocked(setChapterAssignmentStatus);
const hasPendingUploads = jest.mocked(assignmentHasPendingUploads);

const draftToPeerCheck = {
  id: 1,
  chapterAssignmentId: 7,
  userId: 9,
  fromStatus: 'draft',
  toStatus: 'peer_check',
  peerCheckerId: null,
  createdAt: '2026-10-22T12:00:00.000Z',
};

const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
};

describe('syncPendingStageAdvances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetStageAdvanceSyncForTests();
    listPending.mockResolvedValue([draftToPeerCheck]);
    deleteRow.mockResolvedValue(undefined);
    setStatus.mockResolvedValue(undefined);
    submitAssignment.mockResolvedValue({ chapterAssignmentId: 7 });
    hasPendingUploads.mockResolvedValue(false);
  });

  it('does not PATCH while the assignment still has pending uploads', async () => {
    hasPendingUploads.mockResolvedValue(true);
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'draft',
    });

    await expect(syncPendingStageAdvances(9, 'token-9')).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 0,
      blocked: 0,
    });

    expect(hasPendingUploads).toHaveBeenCalledWith(7, 9);
    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('still drops the row when the server is already the to-status despite pending uploads', async () => {
    hasPendingUploads.mockResolvedValue(true);
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'peer_check',
    });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 1,
      failed: 0,
      blocked: 0,
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).toHaveBeenCalledWith(1);
    expect(hasPendingUploads).not.toHaveBeenCalled();
  });

  it('PATCHes and deletes when the server is still the from status', async () => {
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'draft',
    });

    await expect(syncPendingStageAdvances(9, 'token-9')).resolves.toEqual({
      synced: 1,
      dropped: 0,
      failed: 0,
      blocked: 0,
    });

    expect(getAssignment).toHaveBeenCalledWith(7, 'token-9');
    expect(submitAssignment).toHaveBeenCalledWith(7, 'token-9');
    expect(deleteRow).toHaveBeenCalledWith(1);
    expect(getAssignment.mock.invocationCallOrder[0]).toBeLessThan(
      submitAssignment.mock.invocationCallOrder[0],
    );
  });

  it('PATCHes and deletes when the server moved from the from-status but is still short of to (not_started row, server draft)', async () => {
    // New chapter: Send offline queued not_started → peer_check. Claim + takes
    // upload move the server to draft before the drain runs.
    listPending.mockResolvedValue([
      { ...draftToPeerCheck, fromStatus: 'not_started' },
    ]);
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'draft',
    });

    await expect(syncPendingStageAdvances(9, 'token-9')).resolves.toEqual({
      synced: 1,
      dropped: 0,
      failed: 0,
      blocked: 0,
    });

    expect(submitAssignment).toHaveBeenCalledWith(7, 'token-9');
    expect(deleteRow).toHaveBeenCalledWith(1);
  });

  it('deletes without PATCH when the server is already the to status', async () => {
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'peer_check',
    });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 1,
      failed: 0,
      blocked: 0,
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).toHaveBeenCalledWith(1);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('keeps the lower stage and drops the row when the server is ahead', async () => {
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'community_review',
    });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 1,
      failed: 0,
      blocked: 0,
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(7, 'peer_check');
    expect(deleteRow).toHaveBeenCalledWith(1);
  });

  it('keeps the row pending when the PATCH response is still below the target', async () => {
    listPending.mockResolvedValue([
      { ...draftToPeerCheck, fromStatus: 'not_started' },
    ]);
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'not_started',
    });
    submitAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      status: 'draft',
    });

    await expect(syncPendingStageAdvances(9, 'token-9')).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 1,
      blocked: 0,
    });

    expect(submitAssignment).toHaveBeenCalledTimes(1);
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('deletes the row when the PATCH response reaches the target or omits status', async () => {
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'draft',
    });
    submitAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      status: 'peer_check',
    });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 1,
      dropped: 0,
      failed: 0,
      blocked: 0,
    });
    expect(deleteRow).toHaveBeenCalledWith(1);
  });

  it('leaves the row pending when the server status is empty', async () => {
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: '',
    });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 1,
      blocked: 0,
    });
    expect(setStatus).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('leaves the row pending when GET throws', async () => {
    getAssignment.mockRejectedValue(new Error('network'));

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 1,
      blocked: 0,
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it('GETs again after a bad-transition PATCH and does not PATCH twice', async () => {
    getAssignment
      .mockResolvedValueOnce({
        chapterAssignmentId: 7,
        projectId: 1,
        projectUnitId: 1,
        bibleId: 1,
        bookId: 1,
        chapterNumber: 4,
        status: 'draft',
      })
      .mockResolvedValueOnce({
        chapterAssignmentId: 7,
        projectId: 1,
        projectUnitId: 1,
        bibleId: 1,
        bookId: 1,
        chapterNumber: 4,
        status: 'community_review',
      });
    submitAssignment.mockRejectedValue(
      new ApiError(400, 'Invalid status transition'),
    );

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 1,
      failed: 0,
      blocked: 0,
    });

    expect(submitAssignment).toHaveBeenCalledTimes(1);
    expect(getAssignment).toHaveBeenCalledTimes(2);
    expect(setStatus).toHaveBeenCalledWith(7, 'peer_check');
    expect(deleteRow).toHaveBeenCalledWith(1);
  });

  it('keeps the lower stage and drops the row when the server is behind from', async () => {
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'not_started',
    });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 1,
      failed: 0,
      blocked: 0,
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(7, 'not_started');
    expect(deleteRow).toHaveBeenCalledWith(1);
  });

  it('leaves the row pending when the server status is unrecognized', async () => {
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'unknown_stage',
    });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 1,
      blocked: 0,
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('joins an in-flight drain without a concurrent GET, then runs one more pass', async () => {
    // The row is gone after the first pass, as in the real queue.
    listPending.mockResolvedValueOnce([draftToPeerCheck]).mockResolvedValue([]);
    let release!: (value: Awaited<ReturnType<typeof getAssignment>>) => void;
    getAssignment.mockImplementation(
      () =>
        new Promise(resolve => {
          release = resolve;
        }),
    );

    const first = syncPendingStageAdvances(9);
    const second = syncPendingStageAdvances(9);
    await Promise.resolve();
    expect(getAssignment).toHaveBeenCalledTimes(1);

    release({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'peer_check',
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { synced: 0, dropped: 1, failed: 0, blocked: 0 },
      { synced: 0, dropped: 1, failed: 0, blocked: 0 },
    ]);
    expect(submitAssignment).not.toHaveBeenCalled();
    // Initial pass + the rerun the joiner requested.
    expect(listPending).toHaveBeenCalledTimes(2);
  });

  it('re-reads uploads on the rerun so a joiner triggered after takes finish can PATCH', async () => {
    hasPendingUploads
      .mockResolvedValueOnce(true) // stale pass: takes still uploading
      .mockResolvedValue(false); // rerun: takes finished
    getAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'draft',
    });
    let releaseList!: () => void;
    listPending.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          releaseList = () => resolve([draftToPeerCheck]);
        }),
    );

    const first = syncPendingStageAdvances(9, 'token-9');
    const second = syncPendingStageAdvances(9, 'token-9');
    releaseList();

    const [firstResult] = await Promise.all([first, second]);
    expect(submitAssignment).toHaveBeenCalledTimes(1);
    expect(deleteRow).toHaveBeenCalledWith(1);
    expect(firstResult.synced).toBe(1);
  });

  it('runs overlapping drains for different users one after another, never at once (#854)', async () => {
    const userTwo = {
      id: 2,
      chapterAssignmentId: 8,
      userId: 2,
      fromStatus: 'draft',
      toStatus: 'peer_check',
      peerCheckerId: null,
      createdAt: '2026-10-22T12:01:00.000Z',
    };
    listPending.mockResolvedValue([draftToPeerCheck, userTwo]);

    const releases = new Map<
      number,
      (value: Awaited<ReturnType<typeof getAssignment>>) => void
    >();
    getAssignment.mockImplementation(
      (chapterAssignmentId: number) =>
        new Promise(resolve => {
          releases.set(chapterAssignmentId, resolve);
        }),
    );

    const first = syncPendingStageAdvances(9, 'token-9');
    const second = syncPendingStageAdvances(2, 'token-2');
    await flush();

    // User 2's drain waits for user 9's to finish.
    expect(getAssignment.mock.calls).toEqual([[7, 'token-9']]);

    releases.get(7)!({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'peer_check',
    });
    await flush();
    expect(getAssignment.mock.calls).toEqual([
      [7, 'token-9'],
      [8, 'token-2'],
    ]);
    releases.get(8)!({
      chapterAssignmentId: 8,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'draft',
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { synced: 0, dropped: 1, failed: 0, blocked: 0 },
      { synced: 1, dropped: 0, failed: 0, blocked: 0 },
    ]);
  });

  it('never submits one row twice when a multi-account drain overlaps a single-user drain (#854)', async () => {
    let rows = [draftToPeerCheck];
    listPending.mockImplementation(async () => rows);
    deleteRow.mockImplementation(async (id: number) => {
      rows = rows.filter(row => row.id !== id);
    });
    let releaseGet!: () => void;
    const gate = new Promise<void>(resolve => {
      releaseGet = resolve;
    });
    getAssignment.mockImplementation(async () => {
      await gate;
      return {
        chapterAssignmentId: 7,
        projectId: 1,
        projectUnitId: 1,
        bibleId: 1,
        bookId: 1,
        chapterNumber: 4,
        status: 'draft',
      };
    });
    submitAssignment.mockResolvedValue({
      chapterAssignmentId: 7,
      status: 'peer_check',
    });

    const all = drainStageAdvancesForAccounts(
      new Map([
        [9, 'token-9'],
        [2, 'token-2'],
      ]),
      jest.fn(),
    );
    const single = syncPendingStageAdvances(9, 'token-9');
    await flush();
    releaseGet();
    await Promise.all([all, single]);

    expect(submitAssignment).toHaveBeenCalledTimes(1);
  });

  it('does not keep-lower a later chained row when an earlier row fails', async () => {
    const peerToCommunity = {
      id: 2,
      chapterAssignmentId: 7,
      userId: 9,
      fromStatus: 'peer_check',
      toStatus: 'community_review',
      peerCheckerId: null,
      createdAt: '2026-10-22T12:01:00.000Z',
    };
    listPending.mockResolvedValue([draftToPeerCheck, peerToCommunity]);
    getAssignment
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({
        chapterAssignmentId: 7,
        projectId: 1,
        projectUnitId: 1,
        bibleId: 1,
        bookId: 1,
        chapterNumber: 4,
        status: 'draft',
      });

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 1,
      blocked: 0,
    });

    expect(getAssignment).toHaveBeenCalledTimes(1);
    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });
});

describe('stage advances from several accounts on one device (#854)', () => {
  // #847: A (user 9) sends the chapter draft → peer_check, then B (user 2)
  // sends it peer_check → community_review, both offline on one device.
  const aToPeerCheck = draftToPeerCheck;
  const bToCommunityReview = {
    id: 2,
    chapterAssignmentId: 7,
    userId: 2,
    fromStatus: 'peer_check',
    toStatus: 'community_review',
    peerCheckerId: null,
    createdAt: '2026-10-22T12:05:00.000Z',
  };
  const assignment = (status: string) => ({
    chapterAssignmentId: 7,
    projectId: 1,
    projectUnitId: 1,
    bibleId: 1,
    bookId: 1,
    chapterNumber: 3,
    status,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    __resetStageAdvanceSyncForTests();
    listPending.mockResolvedValue([aToPeerCheck, bToCommunityReview]);
    deleteRow.mockResolvedValue(undefined);
    setStatus.mockResolvedValue(undefined);
    hasPendingUploads.mockResolvedValue(false);
  });

  it("holds B's later stage advance behind A's in a single-user drain instead of rolling it back", async () => {
    // Server is still in draft: A's advance has not landed.
    getAssignment.mockResolvedValue(assignment('draft'));

    await expect(syncPendingStageAdvances(2, 'token-2')).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 0,
      blocked: 1,
    });

    expect(getAssignment).not.toHaveBeenCalled();
    expect(submitAssignment).not.toHaveBeenCalled();
    // The keep-lower rule never ran: B's row and B's local stage stay put.
    expect(setStatus).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("sends A's advance with A's token, then B's with B's token, in queue order", async () => {
    getAssignment
      .mockResolvedValueOnce(assignment('draft'))
      .mockResolvedValueOnce(assignment('peer_check'));
    submitAssignment
      .mockResolvedValueOnce(assignment('peer_check'))
      .mockResolvedValueOnce(assignment('community_review'));

    await expect(
      drainStageAdvancesForAccounts(
        new Map([
          [9, 'token-9'],
          [2, 'token-2'],
        ]),
        jest.fn(),
      ),
    ).resolves.toEqual({ synced: 2, dropped: 0, failed: 0, blocked: 0 });

    expect(submitAssignment.mock.calls).toEqual([
      [7, 'token-9'],
      [7, 'token-2'],
    ]);
    expect(hasPendingUploads.mock.calls).toEqual([
      [7, 9],
      [7, 2],
    ]);
    expect(deleteRow.mock.calls).toEqual([[1], [2]]);
  });

  it("holds B's advance while A has no stored session, without failing it", async () => {
    await expect(
      drainStageAdvancesForAccounts(new Map([[2, 'token-2']]), jest.fn()),
    ).resolves.toEqual({ synced: 0, dropped: 0, failed: 0, blocked: 1 });

    expect(getAssignment).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("holds B's advance while A's own takes are still uploading", async () => {
    hasPendingUploads.mockImplementation(async (_id, userId) => userId === 9);
    getAssignment.mockResolvedValue(assignment('draft'));

    await expect(
      drainStageAdvancesForAccounts(
        new Map([
          [9, 'token-9'],
          [2, 'token-2'],
        ]),
        jest.fn(),
      ),
    ).resolves.toEqual({ synced: 0, dropped: 0, failed: 0, blocked: 0 });

    // A waits for its own takes; B is held behind A (same chapter) and is
    // never sent against a server still in draft.
    expect(submitAssignment).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(getAssignment).toHaveBeenCalledTimes(1);
  });

  it("reports one account's rejected token and keeps draining the others", async () => {
    const otherChapter = {
      ...bToCommunityReview,
      id: 3,
      chapterAssignmentId: 8,
      fromStatus: 'draft',
      toStatus: 'peer_check',
    };
    listPending.mockResolvedValue([aToPeerCheck, otherChapter]);
    getAssignment.mockImplementation(async (id: number, token?: string) => {
      if (token === 'token-9') {
        throw new AuthError('expired', 'TOKEN_EXPIRED');
      }
      return { ...assignment('draft'), chapterAssignmentId: id };
    });
    submitAssignment.mockResolvedValue({
      ...assignment('peer_check'),
      chapterAssignmentId: 8,
    });
    const onOwnerAuthFailure = jest.fn();

    await expect(
      drainStageAdvancesForAccounts(
        new Map([
          [9, 'token-9'],
          [2, 'token-2'],
        ]),
        onOwnerAuthFailure,
      ),
    ).resolves.toEqual({ synced: 1, dropped: 0, failed: 0, blocked: 0 });

    expect(onOwnerAuthFailure).toHaveBeenCalledWith(9);
    expect(submitAssignment).toHaveBeenCalledWith(8, 'token-2');
    expect(deleteRow).toHaveBeenCalledWith(3);
    expect(deleteRow).not.toHaveBeenCalledWith(1);
  });

  it("counts only other accounts' rows held behind a rejected account as blocked", async () => {
    const aSecond = {
      ...aToPeerCheck,
      id: 3,
      fromStatus: 'peer_check',
      toStatus: 'community_review',
    };
    listPending.mockResolvedValue([aToPeerCheck, aSecond, bToCommunityReview]);
    getAssignment.mockRejectedValue(new AuthError('expired', 'TOKEN_EXPIRED'));

    await expect(
      drainStageAdvancesForAccounts(
        new Map([
          [9, 'token-9'],
          [2, 'token-2'],
        ]),
        jest.fn(),
      ),
    ).resolves.toEqual({ synced: 0, dropped: 0, failed: 0, blocked: 1 });

    // A's rejected token is sent once, never for A's second row.
    expect(getAssignment).toHaveBeenCalledTimes(1);
    expect(submitAssignment).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('releases the lock when a drain rejects, so the drain queued behind it still runs', async () => {
    const otherChapter = {
      ...bToCommunityReview,
      id: 3,
      chapterAssignmentId: 8,
      fromStatus: 'draft',
      toStatus: 'peer_check',
    };
    listPending.mockResolvedValue([aToPeerCheck, otherChapter]);
    let rejectFirst!: (error: Error) => void;
    getAssignment.mockImplementation((id: number) =>
      id === 7
        ? new Promise((_resolve, reject) => {
            rejectFirst = reject;
          })
        : Promise.resolve({ ...assignment('draft'), chapterAssignmentId: 8 }),
    );
    submitAssignment.mockResolvedValue({
      ...assignment('peer_check'),
      chapterAssignmentId: 8,
    });

    const first = syncPendingStageAdvances(9, 'token-9');
    const second = syncPendingStageAdvances(2, 'token-2');
    await flush();
    rejectFirst(new AuthError('expired', 'TOKEN_EXPIRED'));

    await expect(first).rejects.toBeInstanceOf(AuthError);
    await expect(second).resolves.toMatchObject({ synced: 1 });
    expect(submitAssignment).toHaveBeenCalledWith(8, 'token-2');
  });

  it('still rethrows a rejected token from a single-user drain', async () => {
    listPending.mockResolvedValue([aToPeerCheck]);
    getAssignment.mockRejectedValue(new AuthError('expired', 'TOKEN_EXPIRED'));

    await expect(syncPendingStageAdvances(9, 'token-9')).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});
