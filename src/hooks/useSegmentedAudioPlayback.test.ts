import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  useSegmentedAudioPlayback,
  type PlaybackSegment,
} from './useSegmentedAudioPlayback';

// One player instance per source URI so switching the active segment yields a
// new player object identity — mirroring expo-audio's real
// "recreate the player when the source changes" behaviour, which the hook's
// source-change effect depends on to apply a pending cross-segment seek.
const seekTo = jest.fn().mockResolvedValue(undefined);
const play = jest.fn();
const pause = jest.fn();
const players = new Map<string | null, unknown>();

function getPlayer(uri: string | null) {
  if (!players.has(uri)) {
    players.set(uri, { play, pause, seekTo, currentTime: 0, duration: 0, uri });
  }
  return players.get(uri);
}

let mockPlayerStatus: {
  playing?: boolean;
  didJustFinish?: boolean;
  currentTime?: number;
  duration?: number;
} = { playing: false, didJustFinish: false };

const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined);
const mockUseAudioPlayer = jest.fn(
  (source: { uri?: string } | null, _options?: unknown) =>
    getPlayer(source?.uri ?? null),
);

jest.mock('expo-audio', () => ({
  useAudioPlayer: (source: { uri?: string } | null, options: unknown) =>
    mockUseAudioPlayer(source, options),
  useAudioPlayerStatus: () => mockPlayerStatus,
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
}));

const SEGMENTS: PlaybackSegment[] = [
  { uri: '/tmp/seg-0.aac', durationMs: 5000 },
  { uri: '/tmp/seg-1.aac', durationMs: 3000 },
  { uri: '/tmp/seg-2.aac', durationMs: 2000 },
];

describe('useSegmentedAudioPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    players.clear();
    mockPlayerStatus = { playing: false, didJustFinish: false };
  });

  it('reports the summed duration of all segments', () => {
    const { result } = renderHook(() => useSegmentedAudioPlayback(SEGMENTS));
    expect(result.current.durationMs).toBe(10000);
  });

  it('loads the first segment as the active source and polls at 30ms', () => {
    renderHook(() => useSegmentedAudioPlayback(SEGMENTS));
    expect(mockUseAudioPlayer).toHaveBeenCalledWith(
      { uri: '/tmp/seg-0.aac' },
      { updateInterval: 30 },
    );
  });

  it('maps global position to the active segment offset plus local position', async () => {
    mockPlayerStatus = { playing: true, didJustFinish: false, currentTime: 2 };
    const { result, rerender } = renderHook(
      (props: { segments: PlaybackSegment[] | null }) =>
        useSegmentedAudioPlayback(props.segments),
      { initialProps: { segments: SEGMENTS } },
    );

    // Segment 0 offset is 0 → global == local (2s).
    expect(result.current.positionMs).toBe(2000);

    // Seek into segment 1 (offset 5000ms); local currentTime stays 2s.
    await act(async () => {
      await result.current.seek(6000);
    });
    rerender({ segments: SEGMENTS });
    // 5000 (offset of seg 1) + 2000 (local) = 7000.
    expect(result.current.positionMs).toBe(7000);
  });

  it('seeks within the active segment without switching source', async () => {
    const { result } = renderHook(() => useSegmentedAudioPlayback(SEGMENTS));

    await act(async () => {
      await result.current.seek(2500);
    });

    expect(seekTo).toHaveBeenCalledWith(2.5);
    expect(mockUseAudioPlayer).toHaveBeenLastCalledWith(
      { uri: '/tmp/seg-0.aac' },
      { updateInterval: 30 },
    );
  });

  it('cross-segment seek switches source then seeks to the local offset', async () => {
    const { result } = renderHook(() => useSegmentedAudioPlayback(SEGMENTS));

    // Global 6000ms → segment 1 (offset 5000) local 1000ms → 1.0s.
    await act(async () => {
      await result.current.seek(6000);
    });

    await waitFor(() =>
      expect(mockUseAudioPlayer).toHaveBeenLastCalledWith(
        { uri: '/tmp/seg-1.aac' },
        { updateInterval: 30 },
      ),
    );
    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(1));
  });

  it('resumes playback after a cross-segment seek when already playing', async () => {
    mockPlayerStatus = { playing: true, didJustFinish: false };
    const { result } = renderHook(() => useSegmentedAudioPlayback(SEGMENTS));

    await act(async () => {
      await result.current.seek(9500); // segment 2
    });

    await waitFor(() => expect(play).toHaveBeenCalled());
  });

  it('advances to the next segment and keeps playing when one finishes', async () => {
    const { result, rerender } = renderHook(
      (props: { segments: PlaybackSegment[] | null }) =>
        useSegmentedAudioPlayback(props.segments),
      { initialProps: { segments: SEGMENTS } },
    );

    await act(async () => {
      mockPlayerStatus = { playing: true, didJustFinish: true };
      rerender({ segments: SEGMENTS });
    });

    await waitFor(() =>
      expect(mockUseAudioPlayer).toHaveBeenLastCalledWith(
        { uri: '/tmp/seg-1.aac' },
        { updateInterval: 30 },
      ),
    );
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(result.current.durationMs).toBe(10000);
  });

  it('pauses and rewinds to the start when the last segment finishes (single segment)', async () => {
    const single: PlaybackSegment[] = [
      { uri: '/tmp/only.aac', durationMs: 4000 },
    ];
    const { rerender } = renderHook(
      (props: { segments: PlaybackSegment[] | null }) =>
        useSegmentedAudioPlayback(props.segments),
      { initialProps: { segments: single } },
    );

    await act(async () => {
      mockPlayerStatus = { playing: false, didJustFinish: true };
      rerender({ segments: single });
    });

    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(0));
    expect(pause).toHaveBeenCalled();
  });

  it('behaves like single-file playback for a one-segment manifest', async () => {
    const single: PlaybackSegment[] = [
      { uri: '/tmp/only.aac', durationMs: 4000 },
    ];
    const { result } = renderHook(() => useSegmentedAudioPlayback(single));

    expect(result.current.durationMs).toBe(4000);

    await act(async () => {
      await result.current.seek(1500);
    });
    expect(seekTo).toHaveBeenCalledWith(1.5);
  });

  it('routes audio to the speaker and plays on toggle when idle', async () => {
    const { result } = renderHook(() => useSegmentedAudioPlayback(SEGMENTS));

    await act(async () => {
      await result.current.toggle();
    });

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ allowsRecording: false }),
    );
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('pauses on toggle when already playing', async () => {
    mockPlayerStatus = { playing: true, didJustFinish: false };
    const { result } = renderHook(() => useSegmentedAudioPlayback(SEGMENTS));

    await act(async () => {
      await result.current.toggle();
    });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('is idle and a no-op with a null or empty manifest', async () => {
    const { result } = renderHook(() => useSegmentedAudioPlayback(null));

    expect(result.current.positionMs).toBe(0);
    expect(result.current.durationMs).toBe(0);

    await act(async () => {
      await result.current.toggle();
      await result.current.seek(1000);
    });

    expect(play).not.toHaveBeenCalled();
    expect(seekTo).not.toHaveBeenCalled();
    expect(mockSetAudioModeAsync).not.toHaveBeenCalled();
  });
});
