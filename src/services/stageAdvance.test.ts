jest.mock('./api', () => ({
  FluentAPI: {
    checkServerReachable: jest.fn(),
  },
}));

jest.mock('../db/repository', () => ({
  applyLocalStageAdvanceAndEnqueue: jest.fn(),
}));

jest.mock('./stageAdvanceSync', () => ({
  syncPendingStageAdvances: jest.fn(),
}));

import { FluentAPI } from './api';
import { applyLocalStageAdvanceAndEnqueue } from '../db/repository';
import { confirmStageAdvancement } from './stageAdvance';
import { syncPendingStageAdvances } from './stageAdvanceSync';

const mockReachable = jest.mocked(FluentAPI.checkServerReachable);
const mockApply = jest.mocked(applyLocalStageAdvanceAndEnqueue);
const mockDrain = jest.mocked(syncPendingStageAdvances);

describe('confirmStageAdvancement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApply.mockResolvedValue('saq_1');
    mockReachable.mockResolvedValue(true);
    mockDrain.mockResolvedValue(undefined);
  });

  it('applies local+queue then drains when online', async () => {
    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      destination: {
        nextStatus: 'peer_check',
        buttonLabel: 'Send to Peer Check',
        destinationLabel: 'Peer Check',
      },
    });

    expect(mockApply).toHaveBeenCalledWith(7, 'peer_check');
    expect(mockDrain).toHaveBeenCalled();
  });

  it('skips drain when offline after local write', async () => {
    mockReachable.mockResolvedValue(false);

    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      destination: {
        nextStatus: 'community_check',
        buttonLabel: 'Send to Community Review',
        destinationLabel: 'Community Review',
      },
    });

    expect(mockApply).toHaveBeenCalledWith(7, 'community_check');
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it('does not throw when drain fails after local write', async () => {
    mockDrain.mockRejectedValue(new Error('network'));

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

    expect(mockApply).toHaveBeenCalled();
  });
});
