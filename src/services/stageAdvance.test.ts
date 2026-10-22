jest.mock('../db/repository', () => ({
  updateChapterAssignmentStatusLocally: jest.fn(),
}));

import { updateChapterAssignmentStatusLocally } from '../db/repository';
import { confirmStageAdvancement } from './stageAdvance';

const mockLocalUpdate = jest.mocked(updateChapterAssignmentStatusLocally);

describe('confirmStageAdvancement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalUpdate.mockResolvedValue(undefined);
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
});
