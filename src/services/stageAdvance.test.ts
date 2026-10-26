jest.mock('./api', () => ({
  FluentAPI: {
    checkServerReachable: jest.fn(),
    getChapterAssignment: jest.fn(),
    submitChapterAssignment: jest.fn(),
  },
}));

jest.mock('../db/repository', () => ({
  updateChapterAssignmentStatusLocally: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';
import { updateChapterAssignmentStatusLocally } from '../db/repository';
import { confirmStageAdvancement } from './stageAdvance';

const mockReachable = jest.mocked(FluentAPI.checkServerReachable);
const mockGet = jest.mocked(FluentAPI.getChapterAssignment);
const mockSubmit = jest.mocked(FluentAPI.submitChapterAssignment);
const mockLocalUpdate = jest.mocked(updateChapterAssignmentStatusLocally);

describe('confirmStageAdvancement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authToken.set('initiating-account');
    mockLocalUpdate.mockResolvedValue(undefined);
    mockReachable.mockResolvedValue(true);
    mockGet.mockReset();
    mockSubmit.mockResolvedValue({ chapterAssignmentId: 7 });
  });

  it('writes local status then submits when online', async () => {
    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      destination: {
        nextStatus: 'peer_check',
        buttonLabel: 'Send to Peer Check',
        destinationLabel: 'Peer Check',
      },
    });

    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'peer_check', undefined);
    expect(mockSubmit).toHaveBeenCalledWith(7);
  });

  it('writes local Peer Checker when assigning on Send to Community Review', async () => {
    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      destination: {
        nextStatus: 'community_review',
        buttonLabel: 'Send to Community Review',
        destinationLabel: 'Community Review',
      },
      assignPeerCheckerId: 99,
    });

    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'community_review', 99);
    expect(mockSubmit).toHaveBeenCalledWith(7);
  });

  it('skips submit when offline after local write', async () => {
    mockReachable.mockResolvedValue(false);

    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      destination: {
        nextStatus: 'community_review',
        buttonLabel: 'Send to Community Review',
        destinationLabel: 'Community Review',
      },
    });

    expect(mockLocalUpdate).toHaveBeenCalledWith(
      7,
      'community_review',
      undefined,
    );
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('does not throw when submit fails after local write', async () => {
    mockSubmit.mockRejectedValue(new Error('network'));

    await expect(
      confirmStageAdvancement({
        chapterAssignmentId: 7,
        destination: {
          nextStatus: 'peer_check',
          buttonLabel: 'Send to Peer Check',
          destinationLabel: 'Peer Check',
        },
      }),
    ).resolves.toBeUndefined();

    expect(mockLocalUpdate).toHaveBeenCalled();
  });

  const complete = {
    chapterAssignmentId: 7,
    destination: {
      nextStatus: 'complete' as const,
      buttonLabel: 'Send to Complete',
      destinationLabel: 'Complete',
    },
  };
  const serverAssignment = (status: string, chapterAssignmentId = 7) => ({
    chapterAssignmentId,
    status,
    projectId: 1,
    projectUnitId: 580,
    bibleId: 1,
    bookId: 1,
    chapterNumber: 1,
  });

  it('only writes Complete after the server read confirms it', async () => {
    mockGet.mockResolvedValueOnce(serverAssignment('consultant_check'));
    let finish!: (value: ReturnType<typeof serverAssignment>) => void;
    mockGet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    const operation = confirmStageAdvancement(complete);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockLocalUpdate).not.toHaveBeenCalled();
    finish(serverAssignment('complete'));
    await operation;
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'complete', undefined);
  });

  it.each([401, 403, 500])(
    'surfaces a failed Complete PATCH (%s) without a local Complete',
    async status => {
      mockGet.mockResolvedValue(serverAssignment('consultant_check'));
      mockSubmit.mockRejectedValueOnce(new Error(`HTTP ${status}`));
      await expect(confirmStageAdvancement(complete)).rejects.toThrow(
        `HTTP ${status}`,
      );
      expect(mockLocalUpdate).not.toHaveBeenCalled();
    },
  );

  it('keeps the initiating bearer when accounts switch during confirmation', async () => {
    mockGet
      .mockImplementationOnce(async () => {
        authToken.set('other-account');
        return serverAssignment('consultant_check');
      })
      .mockResolvedValueOnce(serverAssignment('complete'));
    await confirmStageAdvancement(complete);
    expect(mockGet).toHaveBeenNthCalledWith(1, 7, 'initiating-account');
    expect(mockGet).toHaveBeenNthCalledWith(2, 7, 'initiating-account');
    expect(mockSubmit).toHaveBeenCalledWith(7, 'initiating-account');
  });

  it('does not treat a 2xx no-op as Complete', async () => {
    mockGet.mockResolvedValue(serverAssignment('consultant_check'));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow(
      'not confirmed',
    );
    expect(mockLocalUpdate).not.toHaveBeenCalled();
  });

  it('fails offline without persisting a terminal stage', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow('offline');
    expect(mockLocalUpdate).not.toHaveBeenCalled();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('retries an interrupted success without submitting Complete again', async () => {
    mockGet
      .mockResolvedValueOnce(serverAssignment('consultant_check'))
      .mockRejectedValueOnce(new Error('connection lost'));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow(
      'connection lost',
    );
    expect(mockLocalUpdate).not.toHaveBeenCalled();
    mockGet.mockResolvedValue(serverAssignment('complete'));
    await confirmStageAdvancement(complete);
    await confirmStageAdvancement(complete);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'complete', undefined);
  });

  it('does not advance a stale earlier stage when the server has reverted', async () => {
    mockGet.mockResolvedValue(serverAssignment('theological_check'));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow(
      'stage changed',
    );
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockLocalUpdate).not.toHaveBeenCalled();
  });

  it('rejects a response for a different assignment', async () => {
    mockGet
      .mockResolvedValueOnce(serverAssignment('consultant_check'))
      .mockResolvedValueOnce(serverAssignment('complete', 8));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow(
      'not confirmed',
    );
    expect(mockLocalUpdate).not.toHaveBeenCalled();
  });
});
