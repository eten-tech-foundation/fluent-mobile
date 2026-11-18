import { renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLaunchRecoveryPrompt } from './useLaunchRecoveryPrompt';
import { collectLaunchRecoveries } from './pausedTakeLaunchRecovery';

jest.mock('./pausedTakeLaunchRecovery', () => ({
  collectLaunchRecoveries: jest.fn(),
}));
jest.mock('./pausedTakes', () => ({ clearPausedTake: jest.fn() }));
jest.mock('../utils/audioStorage', () => ({ deleteFile: jest.fn() }));
jest.mock('../utils/parseUserId', () => ({ parseUserId: () => 7 }));

const mockCollect = collectLaunchRecoveries as jest.Mock;

describe('useLaunchRecoveryPrompt', () => {
  it("offers only the signed-in account's paused takes", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCollect.mockResolvedValue([
      {
        sessionKey: '5:23',
        segments: ['file:///a.aac'],
        elapsedMs: 4000,
        startedAt: '2026-11-01T10:00:00Z',
        chapterAssignmentId: 5,
        verseNumber: 23,
        userId: 7,
      },
    ]);

    renderHook(() => useLaunchRecoveryPrompt({ onResume: () => true }));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockCollect).toHaveBeenCalledWith(7);
    alert.mockRestore();
  });
});
