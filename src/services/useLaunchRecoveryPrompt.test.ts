import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLaunchRecoveryPrompt } from './useLaunchRecoveryPrompt';
import { collectLaunchRecoveries } from './pausedTakeLaunchRecovery';

jest.mock('./pausedTakeLaunchRecovery', () => ({
  collectLaunchRecoveries: jest.fn(),
}));
const mockClear = jest.fn();
jest.mock('./pausedTakes', () => ({
  clearPausedTake: (key: string) => mockClear(key),
}));
const mockDelete = jest.fn().mockResolvedValue(undefined);
jest.mock('../utils/audioStorage', () => ({
  deleteFile: (uri: string) => mockDelete(uri),
}));
let mockActiveUser = 7;
jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => mockActiveUser,
}));

const mockCollect = collectLaunchRecoveries as jest.Mock;

const take = (userId: number) => ({
  sessionKey: '5:23',
  segments: ['file:///a.aac'],
  elapsedMs: 4000,
  startedAt: '2026-11-01T10:00:00Z',
  chapterAssignmentId: 5,
  verseNumber: 23,
  userId,
});

describe('useLaunchRecoveryPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUser = 7;
  });

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

    await renderHook(() => useLaunchRecoveryPrompt({ onResume: () => true }));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockCollect).toHaveBeenCalledWith(7);
    alert.mockRestore();
  });

  it("doesn't offer a take once the account has changed since the scan", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCollect.mockImplementation(async () => {
      // The scan ran as account 7; by the time it returns, 8 is signed in.
      mockActiveUser = 8;
      return [take(7)];
    });

    await renderHook(() => useLaunchRecoveryPrompt({ onResume: () => true }));

    await waitFor(() => expect(mockCollect).toHaveBeenCalled());
    await act(async () => {});
    expect(alert).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("doesn't delete a take on Discard once the account has changed", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCollect.mockResolvedValue([take(7)]);

    await renderHook(() => useLaunchRecoveryPrompt({ onResume: () => true }));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    mockActiveUser = 8;
    const buttons = alert.mock.calls[0]![2] as {
      text: string;
      onPress: () => void;
    }[];
    buttons.find(b => b.text === 'Discard')!.onPress();

    expect(mockClear).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("deletes the signed-in account's own take on Discard", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCollect.mockResolvedValue([take(7)]);

    await renderHook(() => useLaunchRecoveryPrompt({ onResume: () => true }));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    const buttons = alert.mock.calls[0]![2] as {
      text: string;
      onPress: () => void;
    }[];
    buttons.find(b => b.text === 'Discard')!.onPress();

    expect(mockClear).toHaveBeenCalledWith('5:23');
    expect(mockDelete).toHaveBeenCalledWith('file:///a.aac');
    alert.mockRestore();
  });
});
