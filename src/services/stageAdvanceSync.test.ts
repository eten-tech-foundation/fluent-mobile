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
  syncPendingStageAdvances,
} from './stageAdvanceSync';

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
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(7, 'peer_check');
    expect(deleteRow).toHaveBeenCalledWith(1);
  });

  it('leaves the row pending when GET throws', async () => {
    getAssignment.mockRejectedValue(new Error('network'));

    await expect(syncPendingStageAdvances(9)).resolves.toEqual({
      synced: 0,
      dropped: 0,
      failed: 1,
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
    });

    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('joins an in-flight drain instead of starting a second GET', async () => {
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
      { synced: 0, dropped: 1, failed: 0 },
      { synced: 0, dropped: 1, failed: 0 },
    ]);
    expect(submitAssignment).not.toHaveBeenCalled();
  });

  it('starts independent drains for overlapping calls with different users', async () => {
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
    await Promise.resolve();
    await Promise.resolve();

    expect(getAssignment).toHaveBeenCalledTimes(2);
    expect(getAssignment).toHaveBeenCalledWith(7, 'token-9');
    expect(getAssignment).toHaveBeenCalledWith(8, 'token-2');

    releases.get(7)!({
      chapterAssignmentId: 7,
      projectId: 1,
      projectUnitId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 4,
      status: 'peer_check',
    });
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
      { synced: 0, dropped: 1, failed: 0 },
      { synced: 1, dropped: 0, failed: 0 },
    ]);
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
    });

    expect(getAssignment).toHaveBeenCalledTimes(1);
    expect(submitAssignment).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });
});
