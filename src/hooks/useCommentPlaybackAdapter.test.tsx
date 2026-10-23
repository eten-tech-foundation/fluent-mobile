import { act, renderHook } from '@testing-library/react-native';
import { useCommentPlaybackAdapter } from './useCommentPlaybackAdapter';
import { usePlaybackEngine } from './usePlaybackEngine';

jest.mock('./usePlaybackEngine', () => ({
  usePlaybackEngine: jest.fn(),
}));

const mockUsePlaybackEngine = usePlaybackEngine as jest.MockedFunction<
  typeof usePlaybackEngine
>;

function engineMock(
  status: 'idle' | 'playing' | 'paused',
  overrides: Partial<ReturnType<typeof usePlaybackEngine>> = {},
) {
  return {
    status,
    positionMs: 0,
    durationMs: 0,
    load: jest.fn(async () => undefined),
    play: jest.fn(async () => undefined),
    resume: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    seek: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    ...overrides,
  };
}

describe('useCommentPlaybackAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('plays a comment uri and tracks playingCommentId', async () => {
    const play = jest.fn(async () => undefined);
    mockUsePlaybackEngine.mockReturnValue(engineMock('idle', { play }));
    const { result } = renderHook(() => useCommentPlaybackAdapter());

    await act(async () => {
      result.current.onPlayPauseCommentAudio('c1', 'file://a.aac');
    });

    expect(play).toHaveBeenCalledWith('file://a.aac');
    expect(result.current.playingCommentId).toBe('c1');
  });

  it('pauses when the same playing comment is toggled', async () => {
    const play = jest.fn(async () => undefined);
    const pause = jest.fn(async () => undefined);
    mockUsePlaybackEngine.mockReturnValue(engineMock('idle', { play, pause }));
    const { result, rerender } = renderHook(() => useCommentPlaybackAdapter());

    await act(async () => {
      result.current.onPlayPauseCommentAudio('c1', 'file://a.aac');
    });
    expect(result.current.playingCommentId).toBe('c1');

    mockUsePlaybackEngine.mockReturnValue(
      engineMock('playing', { play, pause }),
    );
    rerender({});

    await act(async () => {
      result.current.onPlayPauseCommentAudio('c1', 'file://a.aac');
    });

    expect(pause).toHaveBeenCalled();
    expect(result.current.playingCommentId).toBeNull();
  });

  it('clears playingCommentId when engine finishes (playing → idle)', async () => {
    const play = jest.fn(async () => undefined);
    mockUsePlaybackEngine.mockReturnValue(engineMock('idle', { play }));
    const { result, rerender } = renderHook(() => useCommentPlaybackAdapter());

    await act(async () => {
      result.current.onPlayPauseCommentAudio('c1', 'file://a.aac');
    });
    expect(result.current.playingCommentId).toBe('c1');

    mockUsePlaybackEngine.mockReturnValue(engineMock('playing', { play }));
    rerender({});
    expect(result.current.playingCommentId).toBe('c1');

    mockUsePlaybackEngine.mockReturnValue(engineMock('idle', { play }));
    rerender({});
    expect(result.current.playingCommentId).toBeNull();
  });
});
