import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAudioPlayback } from './useAudioPlayback';

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  currentTime: 0,
  duration: 0,
};
let mockPlayerStatus: {
  playing?: boolean;
  didJustFinish?: boolean;
  currentTime?: number;
  duration?: number;
} = {
  playing: false,
  didJustFinish: false,
};
const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);
const mockUseAudioPlayer = jest.fn(() => mockPlayer);

jest.mock('expo-audio', () => ({
  useAudioPlayer: (source: unknown, options: unknown) =>
    mockUseAudioPlayer(source, options),
  useAudioPlayerStatus: () => mockPlayerStatus,
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
}));

describe('useAudioPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayerStatus = { playing: false, didJustFinish: false };
  });

  it('polls player status every 50ms so the position readout updates smoothly', () => {
    renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    expect(mockUseAudioPlayer).toHaveBeenCalledWith(
      { uri: '/tmp/take-1.m4a' },
      { updateInterval: 30 },
    );
  });

  it('reports not playing and does nothing on toggle when there is no source', async () => {
    const { result } = renderHook(() => useAudioPlayback(null));
    expect(result.current.isPlaying).toBe(false);

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockPlayer.play).not.toHaveBeenCalled();
    expect(mockSetAudioModeAsync).not.toHaveBeenCalled();
  });

  it('routes audio to the speaker and plays on toggle when idle', async () => {
    const { result } = renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
  });

  it('pauses on toggle when already playing', async () => {
    mockPlayerStatus = { playing: true, didJustFinish: false };
    const { result } = renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));
    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('stop() pauses while playing', () => {
    mockPlayerStatus = { playing: true, didJustFinish: false };
    const { result } = renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    act(() => result.current.stop());
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('stop() is a no-op when nothing is playing', () => {
    mockPlayerStatus = { playing: false, didJustFinish: false };
    const { result } = renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    act(() => result.current.stop());
    expect(mockPlayer.pause).not.toHaveBeenCalled();
  });

  it('pauses and rewinds to the start when a take finishes playing', async () => {
    mockPlayerStatus = { playing: false, didJustFinish: true };
    renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    await waitFor(() => expect(mockPlayer.seekTo).toHaveBeenCalledWith(0));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('exposes position and duration in ms from the player status (seconds)', () => {
    mockPlayerStatus = {
      playing: true,
      didJustFinish: false,
      currentTime: 3.2,
      duration: 12.5,
    };
    const { result } = renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    expect(result.current.positionMs).toBe(3200);
    expect(result.current.durationMs).toBe(12500);
  });

  it('reports zeroed position/duration before a source is loaded', () => {
    const { result } = renderHook(() => useAudioPlayback(null));

    expect(result.current.positionMs).toBe(0);
    expect(result.current.durationMs).toBe(0);
  });

  it('seek() converts ms to seconds and seeks the player', async () => {
    const { result } = renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    await act(async () => {
      await result.current.seek(4500);
    });

    expect(mockPlayer.seekTo).toHaveBeenCalledWith(4.5);
  });

  it('seek() clamps negative positions to the start', async () => {
    const { result } = renderHook(() => useAudioPlayback('/tmp/take-1.m4a'));

    await act(async () => {
      await result.current.seek(-1000);
    });

    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
  });

  it('seek() is a no-op when there is no source', async () => {
    const { result } = renderHook(() => useAudioPlayback(null));

    await act(async () => {
      await result.current.seek(1000);
    });

    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  });
});
