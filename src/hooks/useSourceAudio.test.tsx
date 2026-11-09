import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useSourceAudio } from './useSourceAudio';
import { ApiError } from '../types/api/errors';
import { clearPassageResourceReuse } from '../services/passageResourceReuse';
import type { UseSourceAudioArgs } from './useSourceAudio';

jest.mock('../services/offlineSourceAudio', () => ({
  resolveLocalChapterSourceAudio: jest.fn(async () => null),
  persistSourceAudioChapterMeta: jest.fn(async () => undefined),
}));

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
  const resolveLocalSourceAudio = jest.fn();
  const persistSourceAudioMeta = jest.fn();
  const onPlayingVerseChange = jest.fn();

  const baseArgs = () => ({
    projectId: 1,
    bookCode: 'MRK',
    chapter: 1,
    bibleId: 7,
    languageCode: 'eng',
    verse: 1,
    enabled: true,
    isOnline: true,
    onPlayingVerseChange,
    fetchChapterSourceAudio,
    resolveLocalSourceAudio,
    persistSourceAudioMeta,
  });

  beforeEach(() => {
    clearPassageResourceReuse();
    jest.clearAllMocks();
    mockPlaybackPlay.mockResolvedValue(undefined);
    mockPlaybackStop.mockResolvedValue(undefined);
    mockPlaybackPause.mockResolvedValue(undefined);
    mockPlaybackLoad.mockResolvedValue(undefined);
    mockPlaybackSeek.mockResolvedValue(undefined);
    playbackState.status = 'idle';
    playbackState.positionMs = 0;
    playbackState.durationMs = 0;
    resolveLocalSourceAudio.mockResolvedValue(null);
    persistSourceAudioMeta.mockResolvedValue(undefined);
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

  it('plays a downloaded local file before calling the API (#579)', async () => {
    const localUri = 'file:///downloads/1/source-bible-audio-MRK-1.mp3';
    resolveLocalSourceAudio.mockResolvedValue({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url: localUri,
          scope: 'chapter',
          durationSeconds: 30,
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
    expect(fetchChapterSourceAudio).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.play();
    });
    expect(mockPlaybackLoad).toHaveBeenCalledWith(localUri);

    rerender({ ...baseArgs(), verse: 2 });
    await waitFor(() => {
      expect(mockPlaybackSeek).toHaveBeenCalledWith(4000);
    });
  });

  it('shows empty offline when nothing is downloaded (#579 G.27)', async () => {
    resolveLocalSourceAudio.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useSourceAudio({ ...baseArgs(), isOnline: false }),
    );

    await waitFor(() => {
      expect(result.current.loadState).toBe('empty');
    });
    expect(fetchChapterSourceAudio).not.toHaveBeenCalled();
  });

  it('persists chapter metadata after a successful online fetch (#579)', async () => {
    const data = {
      provider: 'aquifer' as const,
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3' as const,
          url: 'https://cdn.example/ch.mp3',
          scope: 'chapter' as const,
        },
      ],
    };
    fetchChapterSourceAudio.mockResolvedValue(data);

    const { result } = renderHook(() => useSourceAudio(baseArgs()));

    await waitFor(() => {
      expect(result.current.loadState).toBe('ready');
    });
    expect(persistSourceAudioMeta).toHaveBeenCalledWith(1, data);
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

  it('keeps position when verse changes without timestamps (#595)', async () => {
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
      // No verseTimestamps — API often returns none on DEV (#235 / #595).
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
    playbackState.positionMs = 12_500;
    await act(async () => {
      await result.current.pause();
    });

    mockPlaybackSeek.mockClear();
    onPlayingVerseChange.mockClear();

    rerender({ ...baseArgs(), verse: 5 });

    await waitFor(() => {
      expect(onPlayingVerseChange).toHaveBeenCalledWith(5);
    });
    // Without timestamps, seeking to verseStartMs(0) would restart the chapter.
    expect(mockPlaybackSeek).not.toHaveBeenCalled();
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

  it('resumes in place when the caller follows the verse playback reached', async () => {
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
    playbackState.positionMs = 4500;
    await waitFor(
      () => {
        expect(onPlayingVerseChange).toHaveBeenCalledWith(2);
      },
      { timeout: 2000, interval: 50 },
    );

    await act(async () => {
      await result.current.pause();
    });
    rerender({ ...baseArgs(), verse: 2 });
    mockPlaybackSeek.mockClear();
    await act(async () => {
      await result.current.play();
    });

    expect(mockPlaybackSeek).not.toHaveBeenCalled();
  });

  it('keeps its place when a pause lands past the caller verse', async () => {
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
    playbackState.positionMs = 4500;
    await waitFor(
      () => {
        expect(onPlayingVerseChange).toHaveBeenCalledWith(2);
      },
      { timeout: 2000, interval: 50 },
    );
    mockPlaybackSeek.mockClear();

    await act(async () => {
      await result.current.pause();
    });

    expect(result.current.status).toBe('paused');
    expect(mockPlaybackSeek).not.toHaveBeenCalled();
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

  describe('reopening the chapter', () => {
    const response = (url: string, expiresAt?: number) => ({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [
        {
          format: 'mp3',
          url,
          scope: 'chapter',
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        },
      ],
    });

    async function openAndClose(
      args: ReturnType<typeof baseArgs> & {
        userId: number;
      },
    ) {
      const view = renderHook(() => useSourceAudio(args));
      await waitFor(() => {
        expect(view.result.current.loadState).toBe('ready');
      });
      view.unmount();
    }

    it("reuses this account's lookup, and asks again for another account", async () => {
      fetchChapterSourceAudio.mockResolvedValue(
        response('https://cdn.example/ch.mp3'),
      );
      await openAndClose({ ...baseArgs(), userId: 5 });
      await openAndClose({ ...baseArgs(), userId: 5 });
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);
      expect(persistSourceAudioMeta).toHaveBeenCalledTimes(1);

      await openAndClose({ ...baseArgs(), userId: 6 });
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
    });

    it("joins the first open's lookup when reopened before it answers", async () => {
      let answer!: (value: unknown) => void;
      fetchChapterSourceAudio.mockReturnValueOnce(
        new Promise(resolve => {
          answer = resolve;
        }),
      );
      const first = renderHook(() =>
        useSourceAudio({ ...baseArgs(), userId: 5 }),
      );
      await waitFor(() => expect(fetchChapterSourceAudio).toHaveBeenCalled());
      first.unmount();
      const second = renderHook(() =>
        useSourceAudio({ ...baseArgs(), userId: 5 }),
      );
      await act(async () => {
        answer(response('https://cdn.example/ch.mp3'));
      });
      await waitFor(() => {
        expect(second.result.current.loadState).toBe('ready');
      });
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);
    });

    it('asks again when the reused URL has expired, and on retry', async () => {
      fetchChapterSourceAudio
        .mockResolvedValueOnce(
          response('https://cdn.example/old.mp3', 946_684_800),
        )
        .mockResolvedValue(response('https://cdn.example/new.mp3'));
      await openAndClose({ ...baseArgs(), userId: 5 });
      await openAndClose({ ...baseArgs(), userId: 5 });
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);

      const view = renderHook(() =>
        useSourceAudio({ ...baseArgs(), userId: 5 }),
      );
      await waitFor(() => {
        expect(view.result.current.loadState).toBe('ready');
      });
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
      await act(async () => {
        view.result.current.retry();
      });
      await waitFor(() => {
        expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('one mounted hook across accounts', () => {
    const audio = (url: string) => ({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [{ format: 'mp3', url, scope: 'chapter' }],
    });

    function mount(initial: Partial<UseSourceAudioArgs>) {
      return renderHook(
        (props: Partial<UseSourceAudioArgs>) =>
          useSourceAudio({ ...baseArgs(), ...props }),
        { initialProps: initial },
      );
    }

    async function playedUri(result: {
      current: ReturnType<typeof useSourceAudio>;
    }) {
      mockPlaybackLoad.mockClear();
      await act(async () => {
        await result.current.play();
      });
      return mockPlaybackLoad.mock.calls[0]?.[0];
    }

    it("never gives account B account A's audio, remote or downloaded, and stops A's playback", async () => {
      resolveLocalSourceAudio.mockImplementation(async ({ userId }) =>
        userId === 5 ? audio('file:///a-download.mp3') : null,
      );
      fetchChapterSourceAudio.mockResolvedValue(audio('https://cdn/b.mp3'));
      const view = mount({ userId: 5 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(await playedUri(view.result)).toBe('file:///a-download.mp3');
      expect(view.result.current.status).toBe('playing');
      mockPlaybackStop.mockClear();

      view.rerender({ userId: 6 });
      await waitFor(() => expect(mockPlaybackStop).toHaveBeenCalled());
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(view.result.current.status).toBe('idle');
      expect(resolveLocalSourceAudio).toHaveBeenLastCalledWith(
        expect.objectContaining({ userId: 6 }),
      );
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);
      expect(await playedUri(view.result)).toBe('https://cdn/b.mp3');
    });

    it("doesn't serve A's remote lookup to B from the hook's own copy", async () => {
      fetchChapterSourceAudio
        .mockResolvedValueOnce(audio('https://cdn/a.mp3'))
        .mockResolvedValueOnce(audio('https://cdn/b.mp3'));
      const view = mount({ userId: 5 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      view.rerender({ userId: 6 });
      await waitFor(() =>
        expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2),
      );
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(await playedUri(view.result)).toBe('https://cdn/b.mp3');
    });

    it("drops A's late answer once B is showing", async () => {
      let answerA!: (value: unknown) => void;
      fetchChapterSourceAudio
        .mockReturnValueOnce(
          new Promise(resolve => {
            answerA = resolve;
          }),
        )
        .mockResolvedValueOnce(audio('https://cdn/b.mp3'));
      const view = mount({ userId: 5 });
      await waitFor(() =>
        expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1),
      );
      view.rerender({ userId: 6 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      await act(async () => {
        answerA(audio('https://cdn/a.mp3'));
      });
      expect(view.result.current.loadState).toBe('ready');
      expect(await playedUri(view.result)).toBe('https://cdn/b.mp3');
    });

    it("misses its own copy on a later chapter load after A's resources were cleared", async () => {
      fetchChapterSourceAudio.mockResolvedValue(audio('https://cdn/a.mp3'));
      const view = mount({ userId: 5, chapter: 1 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));

      // Away and back: the hook's own copy answers, no new request.
      view.rerender({ userId: 5, chapter: 2 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      view.rerender({ userId: 5, chapter: 1 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);

      clearPassageResourceReuse('5');
      view.rerender({ userId: 5, chapter: 2 });
      await waitFor(() =>
        expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(3),
      );
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      view.rerender({ userId: 5, chapter: 1 });
      await waitFor(() =>
        expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(4),
      );
    });

    it('keeps reusing a valid empty answer, and offline still never asks', async () => {
      fetchChapterSourceAudio.mockResolvedValue({ ...audio('x'), items: [] });
      const view = mount({ userId: 5 });
      await waitFor(() => expect(view.result.current.loadState).toBe('empty'));
      view.unmount();
      const again = mount({ userId: 5 });
      await waitFor(() => expect(again.result.current.loadState).toBe('empty'));
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);

      const offline = mount({ userId: 6, isOnline: false });
      await waitFor(() =>
        expect(offline.result.current.loadState).toBe('empty'),
      );
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);
    });

    it("stops playing and stops offering A's audio when A's resources are cleared, props unchanged", async () => {
      fetchChapterSourceAudio
        .mockResolvedValueOnce(audio('https://cdn/a.mp3'))
        .mockRejectedValueOnce(new ApiError(403, 'forbidden'));
      const view = mount({ userId: 5 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(await playedUri(view.result)).toBe('https://cdn/a.mp3');
      expect(view.result.current.status).toBe('playing');
      mockPlaybackStop.mockClear();

      act(() => {
        clearPassageResourceReuse('5');
      });
      expect(view.result.current.loadState).not.toBe('ready');
      expect(view.result.current.isPlaying).toBe(false);
      await waitFor(() => expect(mockPlaybackStop).toHaveBeenCalled());
      await waitFor(() => expect(view.result.current.loadState).toBe('error'));
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
      // Nothing playable is left behind.
      expect(await playedUri(view.result)).toBeUndefined();
    });

    it("never applies or keeps a lookup that was in flight when A's resources were cleared", async () => {
      let answerOld!: (value: unknown) => void;
      fetchChapterSourceAudio
        .mockReturnValueOnce(
          new Promise(resolve => {
            answerOld = resolve;
          }),
        )
        .mockResolvedValueOnce(audio('https://cdn/after.mp3'))
        .mockResolvedValue(audio('https://cdn/later.mp3'));
      const view = mount({ userId: 5 });
      await waitFor(() =>
        expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1),
      );

      act(() => {
        clearPassageResourceReuse('5');
      });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      await act(async () => {
        answerOld(audio('https://cdn/before.mp3'));
      });
      expect(await playedUri(view.result)).toBe('https://cdn/after.mp3');

      // A remount (the shared reuse) doesn't hand back the obsolete answer either.
      view.unmount();
      const again = mount({ userId: 5 });
      await waitFor(() => expect(again.result.current.loadState).toBe('ready'));
      expect(await playedUri(again.result)).toBe('https://cdn/after.mp3');
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
    });

    it("shows B nothing of A's audio, even for the first render after the switch", async () => {
      fetchChapterSourceAudio
        .mockResolvedValueOnce(audio('https://cdn/a.mp3'))
        .mockReturnValueOnce(new Promise(() => {}));
      const seenByB: ReturnType<typeof useSourceAudio>[] = [];
      const view = renderHook(
        (props: Partial<UseSourceAudioArgs>) => {
          const out = useSourceAudio({ ...baseArgs(), ...props });
          if (props.userId === 6) seenByB.push(out);
          return out;
        },
        { initialProps: { userId: 5 } as Partial<UseSourceAudioArgs> },
      );
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      await playedUri(view.result);
      expect(view.result.current.isPlaying).toBe(true);

      view.rerender({ userId: 6 });
      expect(seenByB.length).toBeGreaterThan(0);
      for (const out of seenByB) {
        expect(out.loadState).toBe('loading');
        expect(out.isPlaying).toBe(false);
        expect(out.durationMs).toBe(0);
      }
      expect(await playedUri(view.result)).toBeUndefined();
    });
  });

  describe('before the player wants it', () => {
    const audio = (url: string) => ({
      provider: 'aquifer',
      bible: { name: 'BSB', abbreviation: 'BSB' },
      bookCode: 'MRK',
      chapter: 1,
      items: [{ format: 'mp3', url, scope: 'chapter' }],
    });

    function mount(initial: Partial<UseSourceAudioArgs>) {
      return renderHook(
        (props: Partial<UseSourceAudioArgs>) =>
          useSourceAudio({ ...baseArgs(), userId: 5, ...props }),
        { initialProps: initial },
      );
    }

    it('looks nothing up and reads as loading, not missing', async () => {
      const view = mount({ deferred: true });
      await act(async () => {});
      expect(view.result.current.loadState).toBe('loading');
      expect(resolveLocalSourceAudio).not.toHaveBeenCalled();
      expect(fetchChapterSourceAudio).not.toHaveBeenCalled();
    });

    it('asks once when wanted, and a reopen reuses the answer', async () => {
      fetchChapterSourceAudio.mockResolvedValue(audio('https://cdn/a.mp3'));
      const view = mount({ deferred: true });
      view.rerender({ deferred: false });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      view.unmount();

      const reopened = mount({ deferred: true });
      reopened.rerender({ deferred: false });
      await waitFor(() =>
        expect(reopened.result.current.loadState).toBe('ready'),
      );
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(1);
    });

    it('keeps the downloaded file first once wanted', async () => {
      resolveLocalSourceAudio.mockResolvedValue(audio('file:///ch.mp3'));
      const view = mount({ deferred: true });
      view.rerender({ deferred: false });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(fetchChapterSourceAudio).not.toHaveBeenCalled();
    });

    it("asks for the account that's active when it's wanted, not the one that opened", async () => {
      fetchChapterSourceAudio.mockResolvedValue(audio('https://cdn/b.mp3'));
      const view = mount({ deferred: true });
      view.rerender({ deferred: true, userId: 6 });
      view.rerender({ deferred: false, userId: 6 });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(resolveLocalSourceAudio).toHaveBeenCalledTimes(1);
      expect(resolveLocalSourceAudio).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 6 }),
      );
    });

    it('asks again after the account is cleared while it waited', async () => {
      fetchChapterSourceAudio.mockResolvedValue(audio('https://cdn/a.mp3'));
      const first = mount({});
      await waitFor(() => expect(first.result.current.loadState).toBe('ready'));
      first.unmount();
      act(() => clearPassageResourceReuse('5'));

      const view = mount({ deferred: true });
      view.rerender({ deferred: false });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
    });

    it('drops a late answer after leaving, and the next open still asks', async () => {
      let answer!: (value: unknown) => void;
      fetchChapterSourceAudio.mockReturnValueOnce(
        new Promise(resolve => {
          answer = resolve;
        }),
      );
      fetchChapterSourceAudio.mockRejectedValueOnce(
        new ApiError(502, 'Bad gateway'),
      );
      const view = mount({ deferred: true, chapter: 2 });
      view.rerender({ deferred: false, chapter: 2 });
      await waitFor(() => expect(fetchChapterSourceAudio).toHaveBeenCalled());
      view.rerender({ deferred: false, chapter: 3 });
      await waitFor(() => expect(view.result.current.loadState).toBe('error'));
      await act(async () => {
        answer(audio('https://cdn/ch2.mp3'));
      });
      expect(view.result.current.loadState).toBe('error');
    });

    it('shows a failure as Retry, and retry asks again', async () => {
      fetchChapterSourceAudio
        .mockRejectedValueOnce(new ApiError(502, 'Bad gateway'))
        .mockResolvedValue(audio('https://cdn/a.mp3'));
      const view = mount({ deferred: true });
      view.rerender({ deferred: false });
      await waitFor(() => expect(view.result.current.loadState).toBe('error'));
      await act(async () => {
        view.result.current.retry();
      });
      await waitFor(() => expect(view.result.current.loadState).toBe('ready'));
      expect(fetchChapterSourceAudio).toHaveBeenCalledTimes(2);
    });
  });
});
