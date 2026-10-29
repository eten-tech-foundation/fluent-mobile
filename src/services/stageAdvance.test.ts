jest.mock('./api', () => ({
  FluentAPI: {
    getChapterAssignment: jest.fn(),
    submitChapterAssignment: jest.fn(),
  },
}));

jest.mock('../db/repository', () => ({
  updateChapterAssignmentStatusLocally: jest.fn(),
  setChapterAssignmentStatus: jest.fn(),
}));

import { FluentAPI } from './api';
import { authToken } from './authToken';
import {
  setChapterAssignmentStatus,
  updateChapterAssignmentStatusLocally,
} from '../db/repository';
import { confirmStageAdvancement } from './stageAdvance';

const mockGet = jest.mocked(FluentAPI.getChapterAssignment);
const mockSubmit = jest.mocked(FluentAPI.submitChapterAssignment);
const mockLocalUpdate = jest.mocked(updateChapterAssignmentStatusLocally);
const mockSetStatus = jest.mocked(setChapterAssignmentStatus);

describe('confirmStageAdvancement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authToken.set('initiating-account');
    mockLocalUpdate.mockResolvedValue(undefined);
    mockSetStatus.mockResolvedValue(undefined);
    mockGet.mockReset();
    mockSubmit.mockResolvedValue({ chapterAssignmentId: 7 });
  });

  it('writes the local status and does not call the server', async () => {
    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      userId: 4,
      destination: {
        nextStatus: 'peer_check',
        buttonLabel: 'Send to Peer Check',
        destinationLabel: 'Peer Check',
      },
    });

    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'peer_check', undefined, 4);
  });

  it('writes the local peer checker when sending to Community Review', async () => {
    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      userId: 4,
      destination: {
        nextStatus: 'community_review',
        buttonLabel: 'Send to Community Review',
        destinationLabel: 'Community Review',
      },
      assignPeerCheckerId: 99,
    });

    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'community_review', 99, 4);
  });

  it('propagates a local write failure', async () => {
    mockLocalUpdate.mockRejectedValue(new Error('sqlite'));

    await expect(
      confirmStageAdvancement({
        chapterAssignmentId: 7,
        userId: 4,
        destination: {
          nextStatus: 'peer_check',
          buttonLabel: 'Send to Peer Check',
          destinationLabel: 'Peer Check',
        },
      }),
    ).rejects.toThrow('sqlite');
  });

  const complete = {
    chapterAssignmentId: 7,
    userId: 4,
    destination: {
      nextStatus: 'complete' as const,
      buttonLabel: 'Send to Complete',
      destinationLabel: 'Complete',
    },
  };
  const serverAssignment = (
    status: string,
    chapterAssignmentId = 7,
    fields: { status?: string; chapterStatus?: string } = { status },
  ) => ({
    chapterAssignmentId,
    projectId: 1,
    projectUnitId: 580,
    bibleId: 1,
    bookId: 1,
    chapterNumber: 1,
    ...fields,
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
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockLocalUpdate).not.toHaveBeenCalled();
    finish(serverAssignment('complete'));
    await operation;
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(7, 'complete');
    expect(mockLocalUpdate).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500])(
    'surfaces a failed Complete PATCH (%s) without a local Complete',
    async status => {
      mockGet.mockResolvedValue(serverAssignment('consultant_check'));
      mockSubmit.mockRejectedValueOnce(new Error(`HTTP ${status}`));
      await expect(confirmStageAdvancement(complete)).rejects.toThrow(
        `HTTP ${status}`,
      );
      expect(mockSetStatus).not.toHaveBeenCalled();
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
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockLocalUpdate).not.toHaveBeenCalled();
  });

  it('fails offline without persisting a terminal stage', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow('offline');
    expect(mockSetStatus).not.toHaveBeenCalled();
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
    expect(mockSetStatus).not.toHaveBeenCalled();
    mockGet.mockResolvedValue(serverAssignment('complete'));
    await confirmStageAdvancement(complete);
    await confirmStageAdvancement(complete);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(7, 'complete');
  });

  it('does not advance a stale earlier stage when the server has reverted', async () => {
    mockGet.mockResolvedValue(serverAssignment('theological_check'));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow(
      'stage changed',
    );
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('rejects a response for a different assignment', async () => {
    mockGet
      .mockResolvedValueOnce(serverAssignment('consultant_check'))
      .mockResolvedValueOnce(serverAssignment('complete', 8));
    await expect(confirmStageAdvancement(complete)).rejects.toThrow(
      'not confirmed',
    );
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it('normalizes casing and whitespace on the pre-write status field', async () => {
    mockGet
      .mockResolvedValueOnce(
        serverAssignment('consultant_check', 7, {
          status: ' Consultant_Check ',
        }),
      )
      .mockResolvedValueOnce(serverAssignment('complete'));
    await confirmStageAdvancement(complete);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(7, 'complete');
  });

  it('accepts chapterStatus-only payloads for both reads', async () => {
    mockGet
      .mockResolvedValueOnce(
        serverAssignment('consultant_check', 7, {
          chapterStatus: 'consultant_check',
        }),
      )
      .mockResolvedValueOnce(
        serverAssignment('complete', 7, { chapterStatus: ' Complete ' }),
      );
    await confirmStageAdvancement(complete);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(7, 'complete');
  });

  it('prefers chapterStatus over conflicting status on the pre-write read', async () => {
    mockGet
      .mockResolvedValueOnce(
        serverAssignment('consultant_check', 7, {
          chapterStatus: 'consultant_check',
          status: 'complete',
        }),
      )
      .mockResolvedValueOnce(serverAssignment('complete'));
    await confirmStageAdvancement(complete);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(7, 'complete');
  });

  it('prefers chapterStatus over conflicting status on Complete readback', async () => {
    mockGet
      .mockResolvedValueOnce(serverAssignment('consultant_check'))
      .mockResolvedValueOnce(
        serverAssignment('complete', 7, {
          chapterStatus: 'complete',
          status: 'consultant_check',
        }),
      );
    await confirmStageAdvancement(complete);
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSetStatus).toHaveBeenCalledWith(7, 'complete');
  });

  it('does not treat a padded non-complete readback as Complete', async () => {
    mockGet
      .mockResolvedValueOnce(serverAssignment('consultant_check'))
      .mockResolvedValueOnce(
        serverAssignment('consultant_check', 7, {
          status: ' Consultant_Check ',
        }),
      );
    await expect(confirmStageAdvancement(complete)).rejects.toThrow(
      'not confirmed',
    );
    expect(mockSetStatus).not.toHaveBeenCalled();
  });
});
