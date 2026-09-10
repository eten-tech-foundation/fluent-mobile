import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSourceAudio } from './useSourceAudio';
import { ApiError } from '../types/api/errors';

const mockPlaybackPlay = jest.fn();
const mockPlaybackStop = jest.fn();
const mockPlaybackPause = jest.fn();
const mockPlaybackLoad = jest.fn();
const mockPlaybackSeek = jest.fn();

const playbackState = {
  status: 'idle' as 'idle' | 'playing' | 'paused',
  positionMs: 0,
  durationMs: 0,
};

jest.mock('./usePlaybackEngine', () => {
  const React = require('react');

  return {
    usePlaybackEngine: () => {
      const [status, setStatus] = React.useState(
        'idle' as 'idle' | 'playing' | 'paused',
      );

      React.useEffect(() => {
        playbackState.status = status;
      }, [status]);

      return {
        play: async (...args: unknown[]) => {
          setStatus('playing');
          return mockPlaybackPlay(...args);
        },
        stop: async (...args: unknown[]) => {
          setStatus('idle');
          return mockPlaybackStop(...args);
        },
        pause: async (...args: unknown[]) => {
          setStatus('paused');
          return mockPlaybackPause(...args);
        },
        load: mockPlaybackLoad,
        seek: mockPlaybackSeek,
        get status() {
          return status;
        },
        get positionMs() {
          return playbackState.positionMs;
        },
        get durationMs() {
          return playbackState.durationMs;
        },
      };
    },
  };
});

describe('useSourceAudio', () => {
  const fetchChapterSourceAudio = jest.fn();
  const onPlayingVerseChange = jest.fn();

  const baseArgs = () => ({
    projectId: 1,
    bookCode: 'MRK',
    chapter: 1,
    bibleId: 7,
    languageCode: 'eng',
    verse: 1,
    enabled: true,
    onPlayingVerseChange,
    fetchChapterSourceAudio,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlaybackPlay.mockResolvedValue(undefined);
    mockPlaybackStop.mockResolvedValue(undefined);
    mockPlaybackPause.mockResolvedValue(undefined);
    mockPlaybackLoad.mockResolvedValue(undefined);
    mockPlaybackSeek.mockResolvedValue(undefined);
    playbackState.status = 'idle';
    playbackState.positionMs = 0;
    playbackState.durationMs = 0;
  });

  it('sets empty when project id is missing', async () => {
    const { result } = renderHook(() =>
      useSourceAudio({
        ...baseArgs(),
        projectId: null,
      }),
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('empty');
    });
    expect(fetchChapterSourceAudio).not.toHaveBeenCalled();
  });

  it('shows loading while language code is still missing', async () => {
    const { result } = renderHook(() =>
      useSourceAudio({
        ...baseArgs(),
        languageCode: undefined,
      }),
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('loading');
    });
    expect(fetchChapterSourceAudio).not.toHaveBeenCalled();
  });

  it('loads ready state and seeks to verse on play', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
      verseTimestamps: [
        { verse: 1, startSeconds: 0 },
        { verse: 2, startSeconds: 4 },
      ],
    });

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      await result.current.play();
    });
    expect(mockPlaybackLoad).toHaveBeenCalledWith('https://cdn.example/ch.mp3');
    expect(mockPlaybackPlay).toHaveBeenCalledWith('https://cdn.example/ch.mp3');
    expect(onPlayingVerseChange).toHaveBeenCalledWith(1);

    rerender({ ...baseArgs(), verse: 2 });
    await waitFor(() => {
      expect(mockPlaybackSeek).toHaveBeenCalledWith(4000);
    });
  });

  it('sets empty when API returns no items', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [],
    });

    const { result } = renderHook(() => useSourceAudio(baseArgs()));

    await waitFor(() => {
      expect(result.current.loadState).toBe('empty');
    });
  });

  it('sets error on API failure and retry refetches', async () => {
    fetchChapterSourceAudio
      .mockRejectedValueOnce(new ApiError(502, 'upstream'))
      .mockResolvedValueOnce({
        provider: 'aquifer',
        bible: { name: 'BSB', abbreviation: 'BSB' },
        bookCode: 'MRK',
        chapter: 1,
        items: [
          {
            format: 'mp3',
            url: 'https://cdn.example/ch.mp3',
            scope: 'chapter',
          },
        ],
      });

    const { result } = renderHook(() => useSourceAudio(baseArgs()));

    await waitFor(() => {
      expect(result.current.loadState).toBe('error');
    });

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });
    expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
  });

  it('stops when disabled', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
    });

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    rerender({ ...baseArgs(), enabled: false });
    await waitFor(() => {
      expect(mockPlaybackStop).toHaveBeenCalled();
      expect(result.current.loadState).toBe('empty');
    });
  });

  it('ignores a delayed fetch after disable', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    fetchChapterSourceAudio.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);
    });

    rerender({ ...baseArgs(), enabled: false });
    await waitFor(() => {
      expect(result.current.loadState).toBe('empty');
    });

    await act(async () => {
      resolveFetch({
        provider: 'aquifer',
        bible: { name: 'BSB', abbreviation: 'BSB' },
        bookCode: 'MRK',
        chapter: 1,
        items: [
          {
            format: 'mp3',
            url: 'https://cdn.example/stale.mp3',
            scope: 'chapter',
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.loadState).toBe('empty');
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('ignores a delayed fetch after switching to a cached chapter', async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    fetchChapterSourceAudio
      .mockResolvedValueOnce({
        provider: 'aquifer',
        bible: { name: 'BSB', abbreviation: 'BSB' },
        bookCode: 'MRK',
        chapter: 1,
        items: [
          {
            format: 'mp3',
            url: 'https://cdn.example/ch1.mp3',
            scope: 'chapter',
          },
        ],
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecond = resolve;
          }),
      );

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    rerender({ ...baseArgs(), chapter: 2 });
    await waitFor(() => {
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
      expect(result.current.loadState).toBe('loading');
    });

    rerender({ ...baseArgs(), chapter: 1 });
    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      resolveSecond({
        provider: 'aquifer',
        bible: { name: 'BSB', abbreviation: 'BSB' },
        bookCode: 'MRK',
        chapter: 2,
        items: [
          {
            format: 'mp3',
            url: 'https://cdn.example/stale-ch2.mp3',
            scope: 'chapter',
          },
        ],
      });
    });

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      await result.current.play();
    });
    expect(mockPlaybackLoad).toHaveBeenCalledWith(
      'https://cdn.example/ch1.mp3',
    );
  });

  it('refetches when a cached item is expired', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 60;
    fetchChapterSourceAudio
      .mockResolvedValueOnce({
        provider: 'aquifer',
        bible: { name: 'BSB', abbreviation: 'BSB' },
        bookCode: 'MRK',
        chapter: 1,
        items: [
          {
            format: 'mp3',
            url: 'https://cdn.example/expired.mp3',
            scope: 'chapter',
            expiresAt: expiredAt,
          },
        ],
      })
      .mockResolvedValueOnce({
        provider: 'aquifer',
        bible: { name: 'BSB', abbreviation: 'BSB' },
        bookCode: 'MRK',
        chapter: 1,
        items: [
          {
            format: 'mp3',
            url: 'https://cdn.example/fresh.mp3',
            scope: 'chapter',
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
      });

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    rerender({ ...baseArgs(), enabled: false });
    await waitFor(() => {
      expect(result.current.loadState).toBe('empty');
    });

    rerender({ ...baseArgs(), enabled: true });
    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });
    expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.play();
    });
    expect(mockPlaybackLoad).toHaveBeenCalledWith(
      'https://cdn.example/fresh.mp3',
    );
  });

  it('does not finish play after stop clears an in-flight load', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
    });

    let resolveLoad: (() => void) | undefined;
    mockPlaybackLoad.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveLoad = resolve;
        }),
    );

    const { result } = renderHook(() => useSourceAudio(baseArgs()));

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    let playPromise: Promise<void> | undefined;
    await act(async () => {
      playPromise = result.current.play();
    });

    await waitFor(() => {
      expect(mockPlaybackLoad).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.stop();
    });

    await act(async () => {
      resolveLoad?.();
      await playPromise;
    });

    expect(mockPlaybackPlay).not.toHaveBeenCalled();
    expect(onPlayingVerseChange).not.toHaveBeenCalledWith(1);
  });

  it('resumes from pause without re-seeking to verse start', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
      verseTimestamps: [
        { verse: 1, startSeconds: 0 },
        { verse: 2, startSeconds: 4 },
      ],
    });

    const { result } = renderHook(() =>
      useSourceAudio({ ...baseArgs(), verse: 2 }),
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      await result.current.play();
    });
    expect(mockPlaybackSeek).toHaveBeenCalledWith(4000);
    expect(mockPlaybackPlay).toHaveBeenCalled();

    mockPlaybackSeek.mockClear();
    mockPlaybackLoad.mockClear();
    mockPlaybackPlay.mockClear();

    playbackState.positionMs = 4500;

    await act(async () => {
      await result.current.pause();
    });
    expect(playbackState.status).toBe('paused');

    await act(async () => {
      await result.current.play();
    });

    expect(mockPlaybackPlay).toHaveBeenCalledWith('https://cdn.example/ch.mp3');
    expect(mockPlaybackLoad).not.toHaveBeenCalled();
    expect(mockPlaybackSeek).not.toHaveBeenCalled();
  });

  it('seeks to the new verse when play resumes after a verse change while paused', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
      verseTimestamps: [
        { verse: 1, startSeconds: 0 },
        { verse: 2, startSeconds: 4 },
      ],
    });

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      await result.current.play();
    });
    await act(async () => {
      await result.current.pause();
    });

    mockPlaybackSeek.mockClear();
    mockPlaybackPlay.mockClear();

    rerender({ ...baseArgs(), verse: 2 });

    await act(async () => {
      await result.current.play();
    });

    expect(mockPlaybackSeek).toHaveBeenCalledWith(4000);
    expect(mockPlaybackPlay).toHaveBeenCalledWith('https://cdn.example/ch.mp3');
  });

  it('seeks immediately when verse changes while paused', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
      verseTimestamps: [
        { verse: 1, startSeconds: 0 },
        { verse: 2, startSeconds: 4 },
      ],
    });

    const { result, rerender } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      await result.current.play();
    });
    await act(async () => {
      await result.current.pause();
    });

    mockPlaybackSeek.mockClear();
    mockPlaybackPlay.mockClear();

    rerender({ ...baseArgs(), verse: 2 });

    await waitFor(() => {
      expect(mockPlaybackSeek).toHaveBeenCalledWith(4000);
    });
    expect(onPlayingVerseChange).toHaveBeenCalledWith(2);
    expect(mockPlaybackPlay).not.toHaveBeenCalled();
  });

  it('updates playing verse as playback position advances', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
      verseTimestamps: [
        { verse: 1, startSeconds: 0 },
        { verse: 2, startSeconds: 4 },
      ],
    });

    const { result } = renderHook(
      (props: ReturnType<typeof baseArgs>) => useSourceAudio(props),
      { initialProps: baseArgs() },
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      await result.current.play();
    });

    expect(result.current.status).toBe('playing');
    expect(onPlayingVerseChange).toHaveBeenCalledWith(1);

    onPlayingVerseChange.mockClear();
    playbackState.positionMs = 4500;

    await waitFor(
      () => {
        expect(onPlayingVerseChange).toHaveBeenCalledWith(2);
      },
      { timeout: 2000, interval: 50 },
    );
  });

  it('does not snap to verse start after scrub then play', async () => {
    fetchChapterSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter',
        },
      ],
      verseTimestamps: [{ verse: 1, startSeconds: 0 }],
    });

    const { result } = renderHook(() => useSourceAudio(baseArgs()));

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });

    await act(async () => {
      await result.current.seek(12_500);
    });
    mockPlaybackSeek.mockClear();
    mockPlaybackLoad.mockClear();

    await act(async () => {
      await result.current.play();
    });

    expect(mockPlaybackPlay).toHaveBeenCalledWith('https://cdn.example/ch.mp3');
    expect(mockPlaybackSeek).not.toHaveBeenCalled();
  });
});
