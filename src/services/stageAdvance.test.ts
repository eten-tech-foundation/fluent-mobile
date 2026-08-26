jest.mock('./api', () => ({
  FluentAPI: {
    checkServerReachable: jest.fn(),
    submitChapterAssignment: jest.fn(),
  },
}));

jest.mock('../db/repository', () => ({
  updateChapterAssignmentStatusLocally: jest.fn(),
}));

import { FluentAPI } from './api';
import { updateChapterAssignmentStatusLocally } from '../db/repository';
import { confirmStageAdvancement } from './stageAdvance';

const mockReachable = jest.mocked(FluentAPI.checkServerReachable);
const mockSubmit = jest.mocked(FluentAPI.submitChapterAssignment);
const mockLocalUpdate = jest.mocked(updateChapterAssignmentStatusLocally);

describe('confirmStageAdvancement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalUpdate.mockResolvedValue(undefined);
    mockReachable.mockResolvedValue(true);
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

    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'peer_check');
    expect(mockSubmit).toHaveBeenCalledWith(7);
  });

  it('skips submit when offline after local write', async () => {
    mockReachable.mockResolvedValue(false);

    await confirmStageAdvancement({
      chapterAssignmentId: 7,
      destination: {
        nextStatus: 'community_check',
        buttonLabel: 'Send to Community Review',
        destinationLabel: 'Community Review',
      },
    });

    expect(mockLocalUpdate).toHaveBeenCalledWith(7, 'community_check');
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
});
