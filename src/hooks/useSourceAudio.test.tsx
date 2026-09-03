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

jest.mock('./usePlaybackEngine', () => ({
  usePlaybackEngine: () => ({
    play: async (...args: unknown[]) => {
      playbackState.status = 'playing';
      return mockPlaybackPlay(...args);
    },
    stop: async (...args: unknown[]) => {
      playbackState.status = 'idle';
      return mockPlaybackStop(...args);
    },
    pause: async (...args: unknown[]) => {
      playbackState.status = 'paused';
      return mockPlaybackPause(...args);
    },
    load: mockPlaybackLoad,
    seek: mockPlaybackSeek,
    get status() {
      return playbackState.status;
    },
    get positionMs() {
      return playbackState.positionMs;
    },
    get durationMs() {
      return playbackState.durationMs;
    },
  }),
}));

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
});
