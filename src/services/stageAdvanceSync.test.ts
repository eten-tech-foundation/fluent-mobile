jest.mock('./api', () => ({
  FluentAPI: {
    submitChapterAssignment: jest.fn(),
    getUserChapterAssignments: jest.fn(),
  },
}));

jest.mock('../db/stageAdvanceQueueRepository', () => ({
  listPendingStageAdvances: jest.fn(),
  removeStageAdvanceQueueItem: jest.fn(),
}));

jest.mock('../db/repository', () => ({
  resolveStageAdvanceConflictLocally: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getChapterAssignmentById: jest.fn(),
}));

jest.mock('./storage', () => ({
  getActiveUserId: jest.fn(() => '42'),
}));

import { FluentAPI } from './api';
import { ApiError } from '../types/api/errors';
import { AuthError } from './authError';
import {
  listPendingStageAdvances,
  removeStageAdvanceQueueItem,
} from '../db/stageAdvanceQueueRepository';
import { resolveStageAdvanceConflictLocally } from '../db/repository';
import { getChapterAssignmentById } from '../db/queries';
import { getActiveUserId } from './storage';
import { syncPendingStageAdvances } from './stageAdvanceSync';

const mockSubmit = jest.mocked(FluentAPI.submitChapterAssignment);
const mockUserAssignments = jest.mocked(FluentAPI.getUserChapterAssignments);
const mockList = jest.mocked(listPendingStageAdvances);
const mockRemove = jest.mocked(removeStageAdvanceQueueItem);
const mockResolve = jest.mocked(resolveStageAdvanceConflictLocally);
const mockGetLocal = jest.mocked(getChapterAssignmentById);
const mockActiveUserId = jest.mocked(getActiveUserId);

describe('syncPendingStageAdvances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemove.mockResolvedValue(undefined);
    mockResolve.mockResolvedValue(undefined);
    mockActiveUserId.mockReturnValue('42');
  });

  it('submits queue items in order and removes on success', async () => {
    mockList.mockResolvedValue([
      {
        id: 'a',
        chapterAssignmentId: 1,
        targetStatus: 'peer_check',
        queueOrder: 1,
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        chapterAssignmentId: 2,
        targetStatus: 'community_check',
        queueOrder: 2,
        queuedAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    mockSubmit.mockResolvedValue({});

    await syncPendingStageAdvances();

    expect(mockSubmit.mock.calls.map(c => c[0])).toEqual([1, 2]);
    expect(mockRemove).toHaveBeenNthCalledWith(1, 'a');
    expect(mockRemove).toHaveBeenNthCalledWith(2, 'b');
  });

  it('stops on retryable failure leaving remaining items queued', async () => {
    mockList.mockResolvedValue([
      {
        id: 'a',
        chapterAssignmentId: 1,
        targetStatus: 'peer_check',
        queueOrder: 1,
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        chapterAssignmentId: 2,
        targetStatus: 'peer_check',
        queueOrder: 2,
        queuedAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    mockSubmit.mockRejectedValue(new ApiError(0, 'network'));

    await syncPendingStageAdvances();

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('stops on auth error without clearing the queue', async () => {
    mockList.mockResolvedValue([
      {
        id: 'a',
        chapterAssignmentId: 1,
        targetStatus: 'peer_check',
        queueOrder: 1,
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    mockSubmit.mockRejectedValue(new AuthError('session expired'));

    await syncPendingStageAdvances();

    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('resolves terminal reject by keeping the lower stage', async () => {
    mockList.mockResolvedValue([
      {
        id: 'a',
        chapterAssignmentId: 7,
        targetStatus: 'community_check',
        queueOrder: 1,
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    mockSubmit.mockRejectedValue(new ApiError(400, 'bad transition'));
    mockGetLocal.mockResolvedValue({
      id: 7,
      projectUnitId: 1,
      projectId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 1,
      assignedUserId: 42,
      status: 'community_check',
      submittedTime: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUserAssignments.mockResolvedValue({
      assignedChapters: [
        {
          chapterAssignmentId: 7,
          projectId: 1,
          projectUnitId: 1,
          bibleId: 1,
          bookId: 1,
          chapterNumber: 1,
          chapterStatus: 'peer_check',
          submittedTime: '2025-12-01T00:00:00.000Z',
        },
      ],
      peerCheckChapters: [],
    });

    await syncPendingStageAdvances();

    expect(mockResolve).toHaveBeenCalledWith(
      7,
      'peer_check',
      '2025-12-01T00:00:00.000Z',
    );
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('skips later in-memory rows for an assignment after terminal clear', async () => {
    mockList.mockResolvedValue([
      {
        id: 'a',
        chapterAssignmentId: 7,
        targetStatus: 'peer_check',
        queueOrder: 1,
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        chapterAssignmentId: 7,
        targetStatus: 'community_check',
        queueOrder: 2,
        queuedAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    mockSubmit.mockRejectedValue(new ApiError(400, 'bad transition'));
    mockGetLocal.mockResolvedValue({
      id: 7,
      projectUnitId: 1,
      projectId: 1,
      bibleId: 1,
      bookId: 1,
      chapterNumber: 1,
      status: 'peer_check',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mockUserAssignments.mockResolvedValue({
      assignedChapters: [
        {
          chapterAssignmentId: 7,
          projectId: 1,
          projectUnitId: 1,
          bibleId: 1,
          bookId: 1,
          chapterNumber: 1,
          chapterStatus: 'draft',
        },
      ],
      peerCheckChapters: [],
    });

    await syncPendingStageAdvances();

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockResolve).toHaveBeenCalledWith(7, 'draft', null);
  });

  it('retains queue when re-pull fails after terminal reject', async () => {
    mockList.mockResolvedValue([
      {
        id: 'a',
        chapterAssignmentId: 7,
        targetStatus: 'peer_check',
        queueOrder: 1,
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        chapterAssignmentId: 8,
        targetStatus: 'peer_check',
        queueOrder: 2,
        queuedAt: '2026-01-01T00:01:00.000Z',
      },
    ]);
    mockSubmit.mockRejectedValue(new ApiError(400, 'bad transition'));
    mockUserAssignments.mockRejectedValue(new ApiError(0, 'network'));

    await syncPendingStageAdvances();

    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight drain across concurrent callers', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    mockList.mockResolvedValue([
      {
        id: 'a',
        chapterAssignmentId: 1,
        targetStatus: 'peer_check',
        queueOrder: 1,
        queuedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    mockSubmit.mockImplementation(async () => {
      await gate;
      return {};
    });

    const first = syncPendingStageAdvances();
    const second = syncPendingStageAdvances();
    release();
    await Promise.all([first, second]);

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });
});
